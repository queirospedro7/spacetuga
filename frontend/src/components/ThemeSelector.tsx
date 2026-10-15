import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center p-0.5 rounded-xl bg-secondary/80 border border-border/60 shadow-xs">
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-label="Modo Claro"
        title="Modo Claro"
        className={`flex items-center justify-center p-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
          theme === 'light'
            ? 'bg-card text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Sun className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-label="Modo Escuro"
        title="Modo Escuro"
        className={`flex items-center justify-center p-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
          theme === 'dark'
            ? 'bg-card text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Moon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme('system')}
        aria-label="Seguir o Sistema"
        title="Automático (Sistema)"
        className={`flex items-center justify-center p-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
          theme === 'system'
            ? 'bg-card text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Laptop className="size-3.5" />
      </button>
    </div>
  );
}
