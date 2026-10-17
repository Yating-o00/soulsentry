import React from 'react';
import AITranslatedText from './AITranslatedText';

export default function AIText({ children, className = "" }) {
  // If children is not a string, just render it as is
  if (typeof children !== 'string') {
    return <span className={className}>{children}</span>;
  }

  // Use the AITranslatedText component which handles AI translation and caching
  return <AITranslatedText text={children} className={className} />;
}