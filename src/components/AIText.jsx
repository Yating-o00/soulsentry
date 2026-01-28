import React, { useState, useEffect } from 'react';
import { useTranslation } from './TranslationContext';
import { Sparkles, Loader2 } from 'lucide-react';

export default function AIText({ children, className = "" }) {
  const { language, aiTranslations, translateText } = useTranslation();
  const [translated, setTranslated] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (language === 'zh') {
      setTranslated(null);
      return;
    }

    if (typeof children !== 'string') return;

    // Check cache first
    if (aiTranslations[children]) {
      setTranslated(aiTranslations[children]);
      return;
    }

    // Need translation
    const fetchTranslation = async () => {
      setLoading(true);
      await translateText(children);
      setLoading(false);
    };

    fetchTranslation();
  }, [language, children, aiTranslations, translateText]);

  if (language === 'zh' || typeof children !== 'string') {
    return <span className={className}>{children}</span>;
  }

  return (
    <span className={`relative group ${className}`}>
      {loading ? (
        <span className="opacity-50 animate-pulse">{children}</span>
      ) : (
        <span className="transition-all duration-300">
          {translated || children}
        </span>
      )}
      {translated && (
        <span className="absolute -top-1 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Sparkles className="w-2 h-2 text-blue-400" />
        </span>
      )}
    </span>
  );
}