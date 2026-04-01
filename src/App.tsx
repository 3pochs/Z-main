import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { OnboardingRoute } from "@/components/onboarding/OnboardingRoute";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import Index from "./pages/Index";
import ExplorePage from "./pages/ExplorePage";
import MarkPage from "./pages/MarkPage";
import BusinessPage from "./pages/BusinessPage";
import ProfilePage from "./pages/ProfilePage";
import NotificationsPage from "./pages/NotificationsPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLogin from "./pages/AdminLogin";
import { ProtectedAdminRoute } from "./components/admin/ProtectedAdminRoute";
import { AdminAccessHelper, setupConsoleAdminAccess } from "./components/admin/AdminAccessHelper";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import NotFound from "./pages/NotFound";
import { useJsApiLoader } from "@react-google-maps/api";

import { LocationProvider } from "./contexts/LocationProvider";
import { OnboardingProvider } from "./contexts/OnboardingProvider";
import { NavigationProvider } from "./contexts/NavigationProvider";
import { AuthProvider } from "./contexts/AuthProvider";
import { PreferencesProvider } from "./contexts/PreferencesProvider";
import { NotificationProvider } from "./contexts/NotificationProvider";
import { AdminAuthProvider } from "./contexts/AdminAuthProvider";
import { GOOGLE_MAPS_AUTH_FAILURE_EVENT } from "./utils/googleMaps";

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const LIBRARIES: ('places')[] = ['places'];

// Ensure API key is available
if (!API_KEY) {
  console.warn('Google Places API key is not configured. Some features may not work properly.');
}

// Setup console admin access
setupConsoleAdminAccess();

const queryClient = new QueryClient();

const GoogleMapsLoader = () => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-script",
    googleMapsApiKey: API_KEY ?? "",
    libraries: LIBRARIES,
  });

  React.useEffect(() => {
    const windowWithAuthFailure = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailureHandler = windowWithAuthFailure.gm_authFailure;

    windowWithAuthFailure.gm_authFailure = () => {
      console.error("Google Maps authentication failed");
      window.dispatchEvent(new Event(GOOGLE_MAPS_AUTH_FAILURE_EVENT));
      previousAuthFailureHandler?.();
    };

    return () => {
      windowWithAuthFailure.gm_authFailure = previousAuthFailureHandler;
    };
  }, []);

  React.useEffect(() => {
    if (isLoaded) {
      console.log("Google Maps API loaded successfully");
    }
  }, [isLoaded]);

  React.useEffect(() => {
    if (loadError) {
      console.error("Google Maps API failed to load:", loadError);
    }
  }, [loadError]);

  return null;
};

// Component to initialize activity tracking with auth context
import { useAuth } from "@/contexts/AuthProvider";
import { activityTrackingService } from "@/services/activityTracking.service";

const ActivityTrackerInitializer = () => {
  const { user } = useAuth();

  React.useEffect(() => {
    if (user?.uid) {
      activityTrackingService.initializeActivityTracking(user.uid);
    }
  }, [user?.uid]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <GoogleMapsLoader />
        <AuthProvider>
          <ActivityTrackerInitializer />
          <PreferencesProvider>
            <OnboardingProvider>
              <LocationProvider>
                <NotificationProvider>
                  <BrowserRouter
                    future={{
                      v7_startTransition: true,
                      v7_relativeSplatPath: true
                    }}
                  >
                    <AdminAuthProvider>
                      <NavigationProvider>
                        <OnboardingRoute>
                          <AdminAccessHelper />
                          <AppShell>
                            <Routes>
                              <Route path="/" element={<Index />} />
                              <Route path="/explore" element={<ExplorePage />} />
                              <Route path="/mark" element={<MarkPage />} />
                              <Route path="/business/:id" element={<BusinessPage />} />
                              <Route path="/profile" element={<ProfilePage />} />
                              <Route path="/notifications" element={<NotificationsPage />} />
                              <Route path="/admin/login" element={<AdminLogin />} />
                              <Route path="/admin" element={
                                <ProtectedAdminRoute>
                                  <AdminDashboard />
                                </ProtectedAdminRoute>
                              } />
                              <Route path="/onboarding" element={<OnboardingWizard />} />
                              <Route path="/privacy" element={<PrivacyPage />} />
                              <Route path="/terms" element={<TermsPage />} />
                              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </AppShell>
                        </OnboardingRoute>
                        <CookieConsent />
                      </NavigationProvider>
                    </AdminAuthProvider>
                  </BrowserRouter>
                </NotificationProvider>
              </LocationProvider>
            </OnboardingProvider>
          </PreferencesProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
