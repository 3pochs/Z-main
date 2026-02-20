import React, { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, MapPin, Trophy, AlertCircle, Settings, RefreshCw, CheckCheck, ExternalLink, Trash2, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/contexts/NotificationProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '@/services/notification.service';
import { useToast } from '@/hooks/use-toast';

const NotificationsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    refreshNotifications,
    requestPermission,
    isNotificationSupported,
    preferences,
    updatePreferences
  } = useNotifications();

  const [showSettings, setShowSettings] = useState(false);

  // Request notification permission when page loads (with debouncing)
  useEffect(() => {
    if (userProfile?.userId) {
      // Debounce permission request to prevent multiple calls
      const timeoutId = setTimeout(() => {
        requestPermission();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [userProfile?.userId, requestPermission]);

  const handleNotificationClick = useCallback(async (notification: any) => {
    await markAsRead(notification.id);

    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  }, [markAsRead, navigate]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'achievement':
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 'new_business':
        return <MapPin className="h-4 w-4 text-blue-500" />;
      case 'score_update':
        return <AlertCircle className="h-4 w-4 text-green-500" />;
      case 'community_activity':
        return <Bell className="h-4 w-4 text-purple-500" />;
      case 'nearby_rating':
        return <MapPin className="h-4 w-4 text-orange-500" />;
      case 'system':
        return <Settings className="h-4 w-4 text-gray-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  if (!userProfile) {
    return (
      <div className="min-h-screen pb-20 md:pb-0 bg-background">
        <div className="max-w-4xl mx-auto p-4">
          <Card>
            <CardContent className="p-6 text-center">
              <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">Sign in to view notifications</h3>
              <p className="text-sm text-muted-foreground">
                Create an account or sign in to receive notifications about new businesses and updates.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-background">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Bell className="h-5 w-5 md:h-6 md:w-6" />
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                Stay updated on new businesses and community activity
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="h-8 w-8 p-0"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>

          {/* Action Buttons - Mobile Optimized */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshNotifications}
              disabled={isLoading}
              className="text-xs px-2 py-1 h-7"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1", isLoading && "animate-spin")} />
              Refresh
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs px-2 py-1 h-7"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={deleteAllNotifications}
                className="text-xs px-2 py-1 h-7 text-destructive hover:text-destructive"
              >
                <Trash className="h-3 w-3 mr-1" />
                Delete all
              </Button>
            )}

          </div>
        </div>

        {/* Notification Settings */}
        {showSettings && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Notification Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isNotificationSupported && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    Browser notifications are not supported or enabled.
                    <Button
                      variant="link"
                      size="sm"
                      onClick={requestPermission}
                      className="p-0 h-auto ml-1"
                    >
                      Enable notifications
                    </Button>
                  </p>
                </div>
              )}

              {preferences && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">New Businesses Nearby</label>
                      <p className="text-xs text-muted-foreground">
                        Get notified when new businesses are added near you
                      </p>
                    </div>
                    <Switch
                      checked={preferences.newBusinessesNearby}
                      onCheckedChange={(checked) =>
                        updatePreferences({ newBusinessesNearby: checked })
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Score Updates</label>
                      <p className="text-xs text-muted-foreground">
                        Get notified when businesses you've rated receive new scores
                      </p>
                    </div>
                    <Switch
                      checked={preferences.scoreUpdates}
                      onCheckedChange={(checked) =>
                        updatePreferences({ scoreUpdates: checked })
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Community Activity</label>
                      <p className="text-xs text-muted-foreground">
                        Get notified about community discussions and updates
                      </p>
                    </div>
                    <Switch
                      checked={preferences.communityActivity}
                      onCheckedChange={(checked) =>
                        updatePreferences({ communityActivity: checked })
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Achievements</label>
                      <p className="text-xs text-muted-foreground">
                        Get notified when you earn new achievements
                      </p>
                    </div>
                    <Switch
                      checked={preferences.achievements}
                      onCheckedChange={(checked) =>
                        updatePreferences({ achievements: checked })
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">System Updates</label>
                      <p className="text-xs text-muted-foreground">
                        Get notified about app updates and important announcements
                      </p>
                    </div>
                    <Switch
                      checked={preferences.systemUpdates}
                      onCheckedChange={(checked) =>
                        updatePreferences({ systemUpdates: checked })
                      }
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notifications List */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-4 w-4 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : notifications.length === 0 ? (
            <Card className="glass border-border">
              <CardContent className="pt-6 text-center">
                <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No notifications yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {isNotificationSupported
                    ? "We'll notify you about nearby business ratings, score updates, and achievements you earn."
                    : "Enable browser notifications to receive updates about nearby business activity and achievements."
                  }
                </p>
                {!isNotificationSupported && (
                  <Button
                    onClick={requestPermission}
                    variant="outline"
                    size="sm"
                  >
                    Enable Notifications
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            notifications.map((notification) => (
              <Card
                key={notification.id}
                className={cn(
                  "glass border-border interactive-scale transition-all",
                  !notification.read && "ring-1 ring-primary/20 bg-primary/5"
                )}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <h4 className={cn(
                            "font-medium text-sm md:text-base",
                            !notification.read && "font-semibold"
                          )}>
                            {notification.title}
                          </h4>
                          <p className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(notification.createdAt)}
                            </span>
                            {!notification.read && (
                              <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                New
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {notification.actionUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNotificationClick(notification);
                              }}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;