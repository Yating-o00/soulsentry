import React, { useState, useEffect } from "react";
import { isMobileDevice, isTouchDevice, getConnectionSpeed } from "../utils/performanceOptimizer";

/**
 * Hook to detect mobile device and optimize accordingly
 */
export const useMobileOptimization = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [connectionSpeed, setConnectionSpeed] = useState('unknown');

  useEffect(() => {
    setIsMobile(isMobileDevice());
    setIsTouch(isTouchDevice());
    setConnectionSpeed(getConnectionSpeed());

    // Update on resize
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    isMobile,
    isTouch,
    connectionSpeed,
    isSlowConnection: ['slow-2g', '2g'].includes(connectionSpeed)
  };
};

/**
 * Mobile-optimized image component
 */
export const MobileImage = ({ src, alt, className, lowQualitySrc }) => {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(lowQualitySrc || src);
  const { isSlowConnection } = useMobileOptimization();

  useEffect(() => {
    if (!isSlowConnection && lowQualitySrc) {
      // Load high quality image
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setCurrentSrc(src);
        setLoaded(true);
      };
    } else {
      setLoaded(true);
    }
  }, [src, lowQualitySrc, isSlowConnection]);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-70'} transition-opacity duration-300`}
      loading="lazy"
    />
  );
};

/**
 * Virtualized list for mobile performance
 */
export const MobileVirtualList = ({ items, renderItem, itemHeight = 80, containerHeight = 600 }) => {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.ceil((scrollTop + containerHeight) / itemHeight);
  
  const visibleItems = items.slice(
    Math.max(0, visibleStart - 2),
    Math.min(items.length, visibleEnd + 2)
  );

  const offsetY = Math.max(0, (visibleStart - 2) * itemHeight);

  return (
    <div
      className="overflow-auto mobile-scroll"
      style={{ height: containerHeight }}
      onScroll={(e) => setScrollTop(e.target.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => renderItem(item, visibleStart - 2 + index))}
        </div>
      </div>
    </div>
  );
};