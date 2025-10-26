
import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: {
				DEFAULT: '1.5rem',
				sm: '2rem',
				lg: '3rem',
				xl: '4rem',
				'2xl': '6rem',
			},
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
		fontFamily: {
			headline: ['Libre Baskerville', 'EB Garamond', 'serif'],
			body: ['Inter', 'system-ui', 'sans-serif'],
			editorial: ['EB Garamond', 'Georgia', 'serif'],
			display: ['Libre Baskerville', 'Crimson Text', 'serif'],
			hint: ['EB Garamond', 'Georgia', 'serif'],
			heading: ['Libre Baskerville', 'serif'],
		},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
			accent: {
				DEFAULT: 'hsl(var(--accent))',
				foreground: 'hsl(var(--accent-foreground))'
			},
			gold: {
				DEFAULT: 'hsl(var(--gold))',
				foreground: 'hsl(var(--gold-foreground))'
			},
			forest: {
				DEFAULT: 'hsl(var(--forest))',
				light: 'hsl(var(--forest-light))',
				foreground: 'hsl(var(--forest-foreground))'
			},
			lavender: {
				DEFAULT: 'hsl(var(--lavender))',
				foreground: 'hsl(var(--lavender-foreground))'
			},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
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
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
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
				},
				'waveform': {
					'0%, 100%': { 
						height: '8px',
						opacity: '0.4'
					},
					'50%': { 
						height: '40px',
						opacity: '1'
					}
				},
				'slide-down': {
					'0%': {
						transform: 'translateY(-100%)',
						opacity: '0'
					},
					'100%': {
						transform: 'translateY(0)',
						opacity: '1'
					}
				},
				'fade-in': {
					'0%': {
						opacity: '0'
					},
					'100%': {
						opacity: '1'
					}
				},
				'wave-pulse': {
					'0%, 100%': { 
						transform: 'scaleY(0.8)',
						opacity: '0.6'
					},
					'50%': { 
						transform: 'scaleY(1.2)',
						opacity: '1'
					}
				},
				'glow': {
					'0%, 100%': {
						boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)'
					},
					'50%': {
						boxShadow: '0 0 40px rgba(59, 130, 246, 0.6)'
					}
				},
			'gentle-glow': {
				'0%, 100%': { boxShadow: '0 0 60px rgba(74, 44, 42, 0.1)' },
				'50%': { boxShadow: '0 0 100px rgba(74, 44, 42, 0.2)' },
			},
			'fade-in-slow': {
				'0%': { opacity: '0', transform: 'translateY(10px)' },
				'100%': { opacity: '1', transform: 'translateY(0)' }
			},
			'lift': {
				'0%': { transform: 'translateY(0)' },
				'100%': { transform: 'translateY(-4px)' }
			},
			'gold-shimmer': {
				'0%, 100%': { opacity: '0.3' },
				'50%': { opacity: '0.6' }
			}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'waveform': 'waveform 1.2s ease-in-out infinite',
				'slide-down': 'slide-down 0.3s ease-out',
				'fade-in': 'fade-in 0.2s ease-out',
        'wave-pulse': 'wave-pulse 1.5s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'gentle-glow': 'gentle-glow 3s ease-in-out infinite',
				'fade-in-slow': 'fade-in-slow 0.6s ease-out',
				'lift': 'lift 0.4s ease-out forwards',
				'gold-shimmer': 'gold-shimmer 3s ease-in-out infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
