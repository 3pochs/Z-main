import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { Button } from '@/components/ui/button';
import { Bell, Search } from 'lucide-react';
import { PlacesSearchBar } from '@/components/ui/places-search-bar';
import { ModalLocationModifier } from '@/components/ui/location-modifier';
import { ModalPreferencesManager } from '@/components/ui/preferences-manager';
import { WelcomeWinksLogo } from '@/components/ui/WelcomeWinksLogo';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/contexts/NotificationProvider';
import { Badge } from '@/components/ui/badge';

export const TopHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile } = useAuth();
  const { unreadCount } = useNotifications();
  const isHomePage = location.pathname === '/';

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background">
      <div className="flex h-16 items-center px-4 md:px-6 gap-4">

        {/* Logo Area - Visible on Mobile, Hidden on Desktop (Sidebar handles it) */}
        <div className="lg:hidden flex items-center mr-2">
          <Link to="/">
            <WelcomeWinksLogo size="sm" variant="icon" />
          </Link>
        </div>

        {/* Search Bar - Expanded on Desktop - Hidden on Home Page */}
        {!isHomePage && (
          <div className="flex-1 max-w-2xl flex items-center gap-2">
            <PlacesSearchBar
              onPlaceSelect={(place) => {
                navigate(`/business/${place.place_id}`);
              }}
              className="w-full"
              inputClassName="bg-background border border-input hover:bg-accent focus:bg-background focus:ring-2 focus:ring-primary/50 transition-all duration-200 rounded-xl h-10 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-2 md:gap-3 ml-auto">
          <ModalLocationModifier />

          <ModalPreferencesManager sections={['navigation', 'location', 'ui']} />

          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate('/notifications')}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
              >
                {unreadCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};
