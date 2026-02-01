.soul-sentry-root {
  --soul-void: #0a0a0f;
  --soul-mist: #f5f5f0;
  --soul-dawn: #e8d5b7;
  --soul-ether: #6366f1;
  --soul-breath: #10b981;
  --soul-twilight: #1e293b;
}

.soul-sentry-root * {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.glass-refined {
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 
      0 4px 30px rgba(0, 0, 0, 0.03),
      0 1px 3px rgba(0, 0, 0, 0.02);
}

.glass-dark {
  background: rgba(10, 10, 15, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.transition-soul {
  transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
}

.hover-lift {
  transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.6s cubic-bezier(0.23, 1, 0.32, 1);
}

.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px -20px rgba(10, 10, 15, 0.15);
}

.gradient-text-subtle {
  background: linear-gradient(135deg, #1e293b 0%, #475569 50%, #1e293b 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% auto;
  animation: shimmer 8s linear infinite;
}

.thinking-dot {
  animation: thinking 1.4s infinite ease-in-out both;
}

.thinking-dot:nth-child(1) { animation-delay: -0.32s; }
.thinking-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes thinking {
  0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
  40% { transform: scale(1); opacity: 1; }
}

.device-active {
  border-color: #e8d5b7;
  background: rgba(232, 213, 183, 0.15);
  box-shadow: 0 0 0 3px rgba(232, 213, 183, 0.2), 0 10px 40px -10px rgba(10, 10, 15, 0.1);
}

.timeline-line {
  position: absolute;
  left: 24px;
  top: 48px;
  bottom: -24px;
  width: 1px;
  background: linear-gradient(to bottom, #e8d5b7, #6366f1, transparent);
  opacity: 0.3;
}

.timeline-item:last-child .timeline-line {
  display: none;
}

.input-glow:focus-within {
  box-shadow: 0 0 0 3px rgba(232, 213, 183, 0.3), 0 10px 40px -10px rgba(0,0,0,0.1);
}

.btn-primary-soul {
  background: linear-gradient(135deg, #0a0a0f 0%, #1e293b 100%);
  color: #f5f5f0;
  transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
}

.btn-primary-soul:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px -10px rgba(10, 10, 15, 0.4);
}

@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}

@keyframes breathe {
  0%, 100% { opacity: 0.4; transform: scale(0.98); }
  50% { opacity: 0.8; transform: scale(1.02); }
}

@keyframes fadeUp {
  0% { opacity: 0; transform: translateY(30px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

.animate-breathe {
  animation: breathe 6s ease-in-out infinite;
}

.animate-fade-up {
  animation: fadeUp 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards;
}

.animate-slide-up {
  animation: slideUp 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards;
}