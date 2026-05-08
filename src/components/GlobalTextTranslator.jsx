import React, { useEffect, useRef } from "react";
import { useTranslation } from "@/components/TranslationContext";
import { base44 } from "@/api/base44Client";

/**
 * GlobalTextTranslator
 * 一键翻译：切到英文时遍历全站 DOM 文本节点 + 关键属性（placeholder/title/aria-label/alt/value）
 * 批量调用 AI 翻译并就地替换。切回中文时还原原始文案。
 */

const CN_REGEX = /[\u4e00-\u9fff]/;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT", "SVG", "PATH"]);
const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label", "alt"];

const cache = new Map(); // 原文 -> 译文
const originalTextMap = new WeakMap(); // textNode -> 原始中文
const originalAttrMap = new WeakMap(); // element -> { attr: original }
const translatedTextNodes = new Set();
const translatedAttrEls = new Set();

function shouldSkip(node) {
  let p = node.parentElement || node;
  while (p) {
    if (p.tagName && SKIP_TAGS.has(p.tagName)) return true;
    if (p.hasAttribute && p.hasAttribute("data-no-translate")) return true;
    if (p.isContentEditable) return true;
    p = p.parentElement;
  }
  return false;
}

function collectChineseTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue;
      if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;
      if (!CN_REGEX.test(text)) return NodeFilter.FILTER_REJECT;
      if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function collectAttrTargets(root) {
  // 收集需要翻译的属性目标：[{el, attr, text}]
  const targets = [];
  const selector = TRANSLATABLE_ATTRS.map((a) => `[${a}]`).join(",");
  const els = root.querySelectorAll ? root.querySelectorAll(selector) : [];
  els.forEach((el) => {
    if (SKIP_TAGS.has(el.tagName)) return;
    if (el.closest && el.closest("[data-no-translate]")) return;
    TRANSLATABLE_ATTRS.forEach((attr) => {
      const v = el.getAttribute(attr);
      if (v && CN_REGEX.test(v)) {
        targets.push({ el, attr, text: v });
      }
    });
  });
  return targets;
}

async function translateBatch(texts) {
  const indexed = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt = `Translate each of the following Chinese UI strings into concise, natural English suitable for a productivity app. Preserve emoji, numbers, punctuation, and placeholders. Do NOT add explanations.

Return ONLY a JSON object: {"translations": ["..","..", ...]} with the same order and length as input.

Input:
${indexed}`;

  try {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          translations: { type: "array", items: { type: "string" } },
        },
        required: ["translations"],
      },
    });
    const arr = (res && res.translations) || [];
    return texts.map((src, i) => arr[i] || src);
  } catch (e) {
    console.warn("[GlobalTextTranslator] batch translate failed", e);
    return texts;
  }
}

async function ensureTranslated(uniqueTexts) {
  const need = uniqueTexts.filter((t) => !cache.has(t));
  const BATCH = 30;
  for (let i = 0; i < need.length; i += BATCH) {
    const slice = need.slice(i, i + BATCH);
    const translated = await translateBatch(slice);
    slice.forEach((src, idx) => cache.set(src, translated[idx]));
  }
}

async function translateAll(root) {
  const textNodes = collectChineseTextNodes(root);
  const attrTargets = collectAttrTargets(root);
  if (!textNodes.length && !attrTargets.length) return;

  // 保存原始
  textNodes.forEach((n) => {
    if (!originalTextMap.has(n)) originalTextMap.set(n, n.nodeValue);
  });
  attrTargets.forEach(({ el, attr, text }) => {
    let store = originalAttrMap.get(el);
    if (!store) {
      store = {};
      originalAttrMap.set(el, store);
    }
    if (!(attr in store)) store[attr] = text;
  });

  // 去重
  const seen = new Set();
  const uniqueTexts = [];
  const pushUnique = (t) => {
    const trimmed = t.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    uniqueTexts.push(trimmed);
  };
  textNodes.forEach((n) => pushUnique(n.nodeValue));
  attrTargets.forEach(({ text }) => pushUnique(text));

  await ensureTranslated(uniqueTexts);

  // 应用文本
  textNodes.forEach((n) => {
    const original = originalTextMap.get(n) || n.nodeValue;
    const trimmed = original.trim();
    const translated = cache.get(trimmed);
    if (translated && translated !== trimmed) {
      const leading = original.match(/^\s*/)[0];
      const trailing = original.match(/\s*$/)[0];
      n.nodeValue = leading + translated + trailing;
      translatedTextNodes.add(n);
    }
  });

  // 应用属性
  attrTargets.forEach(({ el, attr, text }) => {
    const trimmed = text.trim();
    const translated = cache.get(trimmed);
    if (translated && translated !== trimmed) {
      el.setAttribute(attr, translated);
      translatedAttrEls.add(el);
    }
  });
}

function restoreAll() {
  translatedTextNodes.forEach((n) => {
    const original = originalTextMap.get(n);
    if (original != null) n.nodeValue = original;
  });
  translatedTextNodes.clear();

  translatedAttrEls.forEach((el) => {
    const store = originalAttrMap.get(el);
    if (!store) return;
    Object.entries(store).forEach(([attr, original]) => {
      if (original != null) el.setAttribute(attr, original);
    });
  });
  translatedAttrEls.clear();
}

export default function GlobalTextTranslator() {
  const { language } = useTranslation();
  const observerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    // 标记 body 语言，触发全局英文优化样式
    document.body.setAttribute("data-lang", language);
    document.documentElement.setAttribute("lang", language === "en" ? "en" : "zh");

    if (language === "en") {
      translateAll(document.body);

      const observer = new MutationObserver((mutations) => {
        let hasNew = false;
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length) { hasNew = true; break; }
          if (m.type === "characterData") { hasNew = true; break; }
          if (m.type === "attributes") { hasNew = true; break; }
        }
        if (!hasNew) return;
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          translateAll(document.body);
        }, 400);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: TRANSLATABLE_ATTRS,
      });
      observerRef.current = observer;

      return () => {
        observer.disconnect();
        clearTimeout(debounceRef.current);
      };
    } else {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      restoreAll();
    }
  }, [language]);

  return null;
}