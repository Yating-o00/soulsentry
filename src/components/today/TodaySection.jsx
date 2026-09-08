import React from 'react';

/**
 * 章节容器：编号标记 + 错落入场动画
 * marker 样式移植自参考稿 .section-marker
 */
export default function TodaySection({ no, title, sub, index = 0, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`reveal ${className}`} style={{ '--i': index }}>
      <div className="section-marker">
        <span>{no} / {title}</span>
        {sub && <span className="ml-auto pl-3 text-[11px]">{sub}</span>}
      </div>
      <div className={`mt-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
