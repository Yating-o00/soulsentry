/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
    safelist: [
      "from-blue-100", "to-indigo-100", "text-blue-600", "from-blue-500", "to-indigo-500", "hover:from-blue-600", "hover:to-indigo-600", "ring-blue-400", "bg-blue-100", "text-blue-700",
      "from-indigo-100", "to-violet-100", "text-indigo-600", "from-indigo-500", "to-violet-500", "hover:from-indigo-600", "hover:to-violet-600", "ring-indigo-400", "bg-indigo-100", "text-indigo-700",
      "from-slate-100", "text-slate-600", "from-slate-500", "to-blue-500", "hover:from-slate-600", "hover:to-blue-600", "ring-slate-400", "bg-slate-100", "text-slate-700",
      "from-violet-100", "to-purple-100", "text-violet-600", "from-violet-500", "to-purple-500", "hover:from-violet-600", "hover:to-purple-600", "ring-violet-400", "bg-violet-100", "text-violet-700",
      "border-l-violet-500", "bg-violet-500", "text-violet-400",
      "bg-emerald-50", "text-emerald-700", "border-emerald-200",
      "bg-amber-50", "text-amber-700", "border-amber-200",
      "bg-indigo-50", "text-indigo-700", "border-indigo-200",
      "bg-purple-50", "text-purple-700", "border-purple-200",
      "bg-red-50", "text-red-700", "border-red-200",
      "bg-green-50", "text-green-600",
      "bg-orange-50", "text-orange-600",
      "bg-pink-50", "text-pink-700",
    ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}