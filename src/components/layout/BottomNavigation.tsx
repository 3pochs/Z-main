import React from 'react';
import { Home, Search, Plus, Bell, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/contexts/NotificationProvider';

const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Search, label: 'Explore', path: '/explore' },
  // The floating button is handled separately
  { icon: Bell, label: 'Notifications', path: '/notifications' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border bg-card/95 backdrop-blur-lg safe-area-pb">
      <div className="relative flex items-center justify-between px-1 py-1 max-w-md mx-auto">
        {/* Left side icons */}
        <div className="flex flex-1 justify-around">
          {navItems.slice(0, 2).map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Button
                key={item.label}
                variant="ghost"
                size="sm"
                className={cn("flex-col gap-0.5 h-9 w-9 p-0", isActive && "text-primary")}
                onClick={() => navigate(item.path)}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs leading-none">{item.label}</span>
              </Button>
            );
          })}
        </div>

        {/* Floating Action Button - Even smaller and better positioned */}
        <div className="absolute top-[-16px] left-1/2 -translate-x-1/2 z-10">
          <Button
            size="icon"
            className="btn-floating rounded-full h-10 w-10 animate-float shadow-lg"
            aria-label="Wink"
            onClick={() => navigate('/mark')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Right side icons */}
        <div className="flex flex-1 justify-around">
          {navItems.slice(2, 4).map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            const isNotification = item.path === '/notifications';

            return (
              <Button
                key={item.label}
                variant="ghost"
                size="sm"
                className={cn("flex-col gap-0.5 h-9 w-9 p-0 relative", isActive && "text-primary")}
                onClick={() => navigate(item.path)}
              >
                <div className="relative">
                  <Icon className="h-3.5 w-3.5" />
                  {isNotification && unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-2.5 w-2.5 flex items-center justify-center p-0 text-xs min-w-2.5"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Badge>
                  )}
                </div>
                <span className="text-xs leading-none">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};