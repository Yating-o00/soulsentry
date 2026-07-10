/**
 * 判断元素是否为可语音输入的编辑目标
 */
const TEXT_INPUT_TYPES = ["text", "search", "email", "url", "tel", ""];

export function isEditableTarget(el) {
  if (!el || !el.tagName) return false;
  if (el.tagName === "TEXTAREA") return !el.disabled && !el.readOnly;
  if (el.tagName === "INPUT") {
    const type = (el.getAttribute("type") || "").toLowerCase();
    return TEXT_INPUT_TYPES.includes(type) && !el.disabled && !el.readOnly;
  }
  if (el.isContentEditable) return true;
  return false;
}

/**
 * 把文本插入到目标元素的光标处，并触发 React 的 onChange
 */
export function insertTextIntoElement(el, text) {
  if (!el || !document.contains(el)) return;

  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newValue = el.value.slice(0, start) + text + el.value.slice(end);

    // 使用原生 setter，确保 React 受控组件能收到 onChange
    const proto = el.tagName === "INPUT"
      ? window.HTMLInputElement.prototype
      : window.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, newValue);

    const cursor = start + text.length;
    try { el.setSelectionRange(cursor, cursor); } catch (_) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  if (el.isContentEditable) {
    el.focus();
    // execCommand 对 react-quill / contenteditable 兼容性最好
    document.execCommand("insertText", false, text);
  }
}