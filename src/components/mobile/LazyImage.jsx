import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function LazyImage({ 
  src, 
  alt, 
  className = '', 
  placeholder = 'blur',
  aspectRatio = '1/1' 
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px',
        threshold: 0.01
      }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio }}
    >
      {!isLoaded && placeholder === 'blur' && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse" />
      )}
      
      {isInView && (
        <motion.img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          className={`w-full h-full object-cover ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}