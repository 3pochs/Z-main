# Admin Authentication System

## Overview
A secure admin authentication system for Welcome Winks with the following security features:

## Credentials
- **Username**: `admin`
- **Password**: `admin`

## Security Features

### 1. Rate Limiting
- Maximum 3 login attempts
- 5-minute lockout after failed attempts
- Automatic attempt counter reset on successful login

### 2. Session Management
- 24-hour session duration
- Secure session storage with hash validation
- Automatic session cleanup on expiry

### 3. Access Logging
- All login attempts are logged
- Session restoration tracking
- Logout events recorded

### 4. Anti-Tampering
- Session hash validation
- Secure session data structure
- Automatic cleanup of invalid sessions

## How to Access Admin

### Method 1: Direct URL
Navigate to: `/admin/login`

### Method 2: Keyboard Shortcut
Press `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac) from anywhere in the app

### Method 3: Browser Console
Open browser console and type: `window.adminAccess()`

## Admin Dashboard Features
- Analytics overview with KPIs
- Business management
- Report moderation
- Scoring configuration
- Data export capabilities
- Secure logout

## Security Considerations

### Current Implementation
- Basic username/password authentication
- Client-side session management
- Rate limiting protection
- Access attempt logging

### Production Recommendations
1. Move credentials to environment variables
2. Implement server-side authentication
3. Add IP whitelisting
4. Use JWT tokens instead of localStorage
5. Add two-factor authentication
6. Implement proper audit logging
7. Add session timeout warnings
8. Use HTTPS only

## File Structure
```
src/
├── contexts/
│   └── AdminAuthProvider.tsx     # Authentication context
├── pages/
│   ├── AdminLogin.tsx           # Login page
│   └── AdminDashboard.tsx       # Protected dashboard
├── components/admin/
│   ├── ProtectedAdminRoute.tsx  # Route protection
│   └── AdminAccessHelper.tsx    # Access utilities
└── utils/
    └── adminSecurity.ts         # Security utilities
```

## Usage Notes
- Sessions persist across browser refreshes
- Automatic redirect to login if not authenticated
- Clean logout clears all admin data
- Failed attempts are tracked per session
- All admin access is logged for monitoring

## Testing the System

### Step 1: Access Admin Login
1. Navigate to `/admin/login` in your browser
2. Or use keyboard shortcut: `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac)
3. Or open browser console and type: `window.adminAccess()`

### Step 2: Login
- Username: `admin`
- Password: Use the current maintainer-provided credential

### Step 3: Verify Dashboard
The dashboard should show:
- Real KPI data from your Firestore database
- Top businesses by rating count
- Score distribution charts
- Recent businesses added
- Mock pending reports (for low-scoring businesses)

### Step 4: Test Security Features
- Try wrong credentials (should show rate limiting after 3 attempts)
- Close browser and reopen (session should persist)
- Wait 24 hours (session should expire)
- Click logout (should clear session and redirect)

## Troubleshooting

### No Data Showing
- Check browser console for Firebase connection errors
- Ensure Firestore has businesses and ratings collections
- Verify Firebase configuration in `.env`

### Login Issues
- Check browser console for authentication errors
- Clear localStorage if session is corrupted
- Verify admin credentials are correct

### Performance Issues
- Dashboard queries are limited to prevent performance problems
- Large datasets may take longer to load
- Consider implementing pagination for production use

## Development vs Production
This implementation is suitable for development and basic admin needs. For production use, implement proper server-side authentication with additional security measures.
