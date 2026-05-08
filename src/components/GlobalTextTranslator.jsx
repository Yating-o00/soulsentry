import React, { useEffect, useRef } from "react";
import { useTranslation } from "@/components/TranslationContext";
import { base44 } from "@/api/base44Client";

/**
 * GlobalTextTranslator
 * 一键翻译：切到英文时遍历全站 DOM 文本节点，批量调用 AI 翻译并就地替换。
 * 切回中文时还原原始文案。
 *
 * 特性：
 * - 仅翻译包含中文字符的文本节点
 * - 跳过 <script>/<style>/<code>/<pre>/<textarea>/<input>，及含 data-no-translate 的元素
 * - 内存缓存翻译结果，避免重复请求
 * - 对路由切换 / 动态渲染使用 MutationObserver 增量翻译
 */

const CN_REGEX = /[\u4e00-\u9fff]/;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "INPUT", "NOSCRIPT", "SVG", "PATH"]);

const cache = new Map(); // 原文 -> 译文
const originalMap = new WeakMap(); // textNode -> 原始中文
const translatedNodes = new Set(); // 已翻译的节点（用于还原）

function shouldSkip(node) {
  let p = node.parentElement;
  while (p) {
    if (SKIP_TAGS.has(p.tagName)) return true;
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

async function translateBatch(texts) {
  // 批量翻译：用编号包装，要求模型按 JSON 返回
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

async function translateAll(root) {
  const nodes = collectChineseTextNodes(root);
  if (!nodes.length) return;

  // 保存原始文本
  nodes.forEach((n) => {
    if (!originalMap.has(n)) originalMap.set(n, n.nodeValue);
  });

  // 收集需要请求的去重文本
  const uniqueTexts = [];
  const seen = new Set();
  nodes.forEach((n) => {
    const t = n.nodeValue.trim();
    if (!cache.has(t) && !seen.has(t)) {
      seen.add(t);
      uniqueTexts.push(t);
    }
  });

  // 分批翻译（每批 ~30 条）
  const BATCH = 30;
  for (let i = 0; i < uniqueTexts.length; i += BATCH) {
    const slice = uniqueTexts.slice(i, i + BATCH);
    const translated = await translateBatch(slice);
    slice.forEach((src, idx) => cache.set(src, translated[idx]));
  }

  // 应用翻译
  nodes.forEach((n) => {
    const original = originalMap.get(n) || n.nodeValue;
    const trimmed = original.trim();
    const translated = cache.get(trimmed);
    if (translated && translated !== trimmed) {
      // 保留前后空白
      const leading = original.match(/^\s*/)[0];
      const trailing = original.match(/\s*$/)[0];
      n.nodeValue = leading + translated + trailing;
      translatedNodes.add(n);
    }
  });
}

function restoreAll() {
  translatedNodes.forEach((n) => {
    const original = originalMap.get(n);
    if (original != null) n.nodeValue = original;
  });
  translatedNodes.clear();
}

export default function GlobalTextTranslator() {
  const { language } = useTranslation();
  const observerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (language === "en") {
      // 首次/切换时翻译整页
      translateAll(document.body);

      // 监听后续 DOM 变化（路由切换、异步渲染）
      const observer = new MutationObserver((mutations) => {
        let hasNew = false;
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length) {
            hasNew = true;
            break;
          }
          if (m.type === "characterData") {
            hasNew = true;
            break;
          }
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
      });
      observerRef.current = observer;

      return () => {
        observer.disconnect();
        clearTimeout(debounceRef.current);
      };
    } else {
      // 切回中文，还原
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      restoreAll();
    }
  }, [language]);

  return null;
}