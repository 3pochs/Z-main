import React from 'react';
import { Home, Search, Plus, Bell, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WelcomeWinksLogo } from '@/components/ui/WelcomeWinksLogo';

const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Search, label: 'Explore', path: '/explore' },
  { icon: Plus, label: 'Wink at a Place', path: '/mark', isPrimary: true },
  { icon: Bell, label: 'Notifications', path: '/notifications' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export const DesktopSidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 border-r bg-background z-40">
      <div className="h-20 flex items-center px-6 border-b">
        <WelcomeWinksLogo size="md" showTagline />
      </div>

      <div className="flex flex-col h-full p-6">
        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Button
                key={item.label}
                variant={item.isPrimary ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 h-11 text-sm font-medium transition-colors mb-1 rounded-lg",
                  item.isPrimary && "mt-6 shadow-sm hover:shadow-md bg-primary text-primary-foreground hover:bg-primary/90",
                  isActive && !item.isPrimary && "bg-primary/15 text-primary font-semibold",
                  !isActive && !item.isPrimary && "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
                onClick={() => navigate(item.path)}
              >
                <Icon className={cn("h-4 w-4", isActive && !item.isPrimary && "text-foreground")} />
                {item.label}
              </Button>
            );
          })}
        </nav>
      </div>

      <div className="p-6 border-t mt-auto">
        <div className="text-xs text-muted-foreground text-center">
          <p>&copy; {new Date().getFullYear()} Welcome Winks.</p>
          <p className="mt-1">Helping others choose where to go.</p>
        </div>
      </div>
    </aside>
  );
};