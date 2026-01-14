// Performance optimization utilities for mobile devices

/**
 * Lazy load images with Intersection Observer
 */
export const lazyLoadImage = (img) => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const lazyImage = entry.target;
        lazyImage.src = lazyImage.dataset.src;
        lazyImage.classList.remove('lazy');
        observer.unobserve(lazyImage);
      }
    });
  });
  
  observer.observe(img);
};

/**
 * Debounce function for performance
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function for scroll/resize events
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Check if device is mobile
 */
export const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Check if device supports touch
 */
export const isTouchDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

/**
 * Get connection speed
 */
export const getConnectionSpeed = () => {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return 'unknown';
  
  if (connection.effectiveType) {
    return connection.effectiveType; // '4g', '3g', '2g', 'slow-2g'
  }
  
  return 'unknown';
};

/**
 * Preload critical resources
 */
export const preloadResource = (url, type = 'fetch') => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = url;
  link.as = type;
  document.head.appendChild(link);
};

/**
 * Request idle callback wrapper
 */
export const runWhenIdle = (callback) => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(callback);
  } else {
    setTimeout(callback, 1);
  }
};

/**
 * Optimize animations based on device performance
 */
export const shouldReduceMotion = () => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Battery status aware optimization
 */
export const isBatterySaving = async () => {
  if ('getBattery' in navigator) {
    try {
      const battery = await navigator.getBattery();
      return battery.level < 0.2 && !battery.charging;
    } catch (e) {
      return false;
    }
  }
  return false;
};

/**
 * Memory usage checker
 */
export const getMemoryUsage = () => {
  if ('memory' in performance) {
    const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
    return {
      used: usedJSHeapSize,
      limit: jsHeapSizeLimit,
      percentage: (usedJSHeapSize / jsHeapSizeLimit) * 100
    };
  }
  return null;
};