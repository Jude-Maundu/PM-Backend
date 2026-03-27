import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/users.js';
import jwt from 'jsonwebtoken';

// Only configure Google OAuth if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('your_')) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('🔵 GoogleStrategy profile:', profile);
        // Check if user already exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          console.log('✅ Found user by googleId:', user.email);
          return done(null, user);
        }

        // Check if user exists with same email
        user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
          // Link Google account to existing user
          user.googleId = profile.id;
          user.isVerified = true; // Mark as verified since Google verified
          await user.save();
          console.log('✅ Linked Google to existing user:', user.email);
          return done(null, user);
        }

        // Create new user
        const newUser = await User.create({
          googleId: profile.id,
          username: profile.displayName || profile.emails[0].value.split('@')[0],
          email: profile.emails[0].value,
          profilePicture: profile.photos[0]?.value || '',
          isVerified: true, // Google accounts are pre-verified
          role: 'user', // Default role, can be changed later
          phoneNumber: '' // Will need to be filled later for M-Pesa
        });
        console.log('✅ Created new Google user:', newUser.email);
        return done(null, newUser);
      } catch (error) {
        console.error('❌ GoogleStrategy error:', error);
        return done(error, null);
      }
    }
  ));
} else {
  console.warn('⚠️ Google OAuth credentials not configured - Google login disabled');
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;