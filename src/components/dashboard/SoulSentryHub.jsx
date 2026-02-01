css
/* SoulSentryHub.css */
/* Minimal styles, relying mostly on Tailwind utility classes in the component */

@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
}

.animate-pulse-glow {
  animation: pulse-glow 2s infinite ease-in-out;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
