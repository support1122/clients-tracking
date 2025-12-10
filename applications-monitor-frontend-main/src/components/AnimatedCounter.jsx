import React, { useEffect, useState, useRef } from 'react';

export function AnimatedCounter({ value, duration = 1000, loading = false }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (loading) {
      // Show pulsing animation while loading
      setIsAnimating(true);
      return;
    }

    if (prevValueRef.current !== value) {
      setIsAnimating(true);
      const startValue = prevValueRef.current;
      const endValue = value;
      const startTime = Date.now();

      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth animation
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = Math.floor(startValue + (endValue - startValue) * easeOutQuart);

        setDisplayValue(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(endValue);
          setIsAnimating(false);
        }
      };

      requestAnimationFrame(animate);
      prevValueRef.current = value;
    } else {
      setDisplayValue(value);
    }
  }, [value, duration, loading]);

  if (loading) {
    return (
      <span className="inline-flex items-center">
        <span className="animate-pulse">---</span>
        <span className="ml-1 inline-block w-2 h-2 bg-current rounded-full animate-pulse"></span>
      </span>
    );
  }

  return (
    <span className={isAnimating ? 'transition-all duration-300' : ''}>
      {displayValue.toLocaleString()}
    </span>
  );
}

export function AnimatedDecimalCounter({ value, decimals = 1, duration = 1000, loading = false }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (loading) {
      setIsAnimating(true);
      return;
    }

    if (prevValueRef.current !== value) {
      setIsAnimating(true);
      const startValue = prevValueRef.current;
      const endValue = value;
      const startTime = Date.now();

      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = startValue + (endValue - startValue) * easeOutQuart;

        setDisplayValue(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(endValue);
          setIsAnimating(false);
        }
      };

      requestAnimationFrame(animate);
      prevValueRef.current = value;
    } else {
      setDisplayValue(value);
    }
  }, [value, duration, loading]);

  if (loading) {
    return (
      <span className="inline-flex items-center">
        <span className="animate-pulse">---</span>
        <span className="ml-1 inline-block w-2 h-2 bg-current rounded-full animate-pulse"></span>
      </span>
    );
  }

  return (
    <span className={isAnimating ? 'transition-all duration-300' : ''}>
      {displayValue.toFixed(decimals)}
    </span>
  );
}

