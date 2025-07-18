import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as JwtStrategy } from "passport-jwt";
import { AuthProvider, User } from "../entities/user.entity";
import AppDataSource from "./db.config";
import jwt from "jsonwebtoken";

// Initialize User repository to interact with the database
// This sets up TypeORM to perform CRUD operations on the User entity
const userDB = AppDataSource.getRepository(User);

// Extracts JWT from request cookies
// Purpose: Retrieves the JWT stored in the 'token' cookie for authentication
// How it works: Checks if the request has cookies and returns the 'token' value, or null if not found
const cookieExtractor = (req) => {
    let token = null;
    if (req && req.cookies) {
        token = req.cookies["token"];
    }
    return token;
};

// Configures JWT Strategy for token-based authentication
// Purpose: Validates JWT from cookies and authenticates users by fetching their data from the database
// How it works: 
// - Uses cookieExtractor to get the JWT
// - Verifies the token with a secret key
// - Queries the database for the user based on the token's payload ID
// Major Features:
// - Cookie-based token extraction for secure, stateless authentication
// - Database lookup to ensure user exists
// - Error handling for database or token verification failures
// - Asynchronous to prevent blocking the server
passport.use(
    new JwtStrategy(
        {
            jwtFromRequest: cookieExtractor, // Function to extract JWT from cookies
            secretOrKey: process.env.JWT_SECRET || "jwt_secret_key123", // Secret key for token verification (uses env variable or fallback)
        },
        async (jwt_payload, done) => {
            try {
                // Look up user by ID from JWT payload
                const user = await userDB.findOneBy({ id: jwt_payload.id });
                if (user) {
                    // User found, pass to Passport for successful authentication
                    return done(null, user);
                }
                // No user found, authentication fails
                return done(null, false);
            } catch (err) {
                // Handle database or other errors
                return done(err, false);
            }
        }
    )
);

// Configures Google OAuth 2.0 Strategy for Google login
// Purpose: Allows users to authenticate via Google, creating new users if needed and issuing a JWT
// How it works:
// - Redirects users to Google for login
// - On callback, checks if user exists by googleId
// - Creates a new user if none exists, then generates a JWT
// Major Features:
// - Seamless Google OAuth integration for single sign-on
// - Automatic user creation with Google profile data (email, name)
// - JWT generation for session management (2-hour expiry)
// - Marks users as verified since Google validates emails
// - Robust error handling for database operations
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "https://api.dajuvai.com/api/auth/google/callback",
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if user exists with the Google ID
                let user = await userDB.findOne({
                    where: { googleId: profile.id },
                });

                if (!user) {
                    // Check if a user with the same email already exists
                    user = await userDB.findOne({
                        where: { email: profile.emails[0].value },
                    });

                    if (user) {
                        // User with this email exists; link Google account to existing user
                        user.googleId = profile.id;
                        user.isVerified = true;
                        user.provider = AuthProvider.GOOGLE;
                        await userDB.save(user);
                    } else {
                        // No user with this email or Google ID; create a new user
                        user = userDB.create({
                            googleId: profile.id,
                            email: profile.emails[0].value,
                            username: profile.displayName,
                            isVerified: true,
                            provider: AuthProvider.GOOGLE,
                        });
                        await userDB.save(user);
                    }
                }


                // Generate JWT for session
                const token = jwt.sign(
                    {
                        id: user.id,
                        email: user.email,
                        username: user.username || profile.displayName,
                    },
                    process.env.JWT_SECRET || "your_jwt_secret",
                    { expiresIn: "2h" }
                );

                // Pass user and token to Passport
                return done(null, { user, token });
            } catch (error) {
                // Handle database or other errors
                return done(error, false);
            }
        }
    )
);

// Configures Facebook OAuth Strategy for Facebook login
// Purpose: Enables authentication via Facebook, creating new users if needed and issuing a JWT
// How it works:
// - Redirects users to Facebook for login
// - On callback, checks if user exists by facebookId
// - Creates a new user if none exists, then generates a JWT
// Major Features:
// - Facebook OAuth integration for single sign-on
// - Retrieves specific profile fields (id, name, email, photos)
// - Automatic user creation with Facebook profile data
// - JWT generation for session management (2-hour expiry)
// - Marks users as verified since Facebook validates emails
// - Robust error handling for database operations
passport.use(
    new FacebookStrategy(
        {
            clientID: process.env.FACEBOOK_APP_ID, // Facebook app ID from env
            clientSecret: process.env.FACEBOOK_APP_SECRET, // Facebook app secret from env
            // callbackURL: "https://leafletdv.onrender.com/api/auth/facebook/callback", // URL Facebook redirects to after login
            callbackURL: "https://leafletdv.onrender.com/api/auth/facebook/callback", // URL Facebook redirects to after login
            profileFields: ["id", "displayName", "photos", "email"], // Specific data to retrieve from Facebook
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if user exists with the Facebook ID
                let user = await userDB.findOne({
                    where: { facebookId: profile.id },
                });
                if (!user) {
                    // Create new user with Facebook profile data
                    user = await userDB.findOne({
                        where: { email: profile.emails[0].value },
                    });

                    if (user) {
                        user.facebookId = profile.id;
                        user.isVerified = true; // Facebook verified
                        await userDB.save(user);
                    } else {
                        user = userDB.create({
                            facebookId: profile.id,
                            email: profile.emails[0].value,
                            username: profile.displayName,
                            isVerified: true,
                        });
                        await userDB.save(user);
                    }
                }
                // Generate JWT for session
                const token = jwt.sign(
                    {
                        id: user.id,
                        email: user.email,
                        username: user.username || profile.displayName,
                    },
                    process.env.JWT_SECRET || "your_jwt_secret", // Secret key for signing
                    { expiresIn: "2h" } // Token expires in 2 hours
                );
                // Pass user and token to Passport
                return done(null, { user, token });
            } catch (error) {
                // Handle database or other errors
                return done(error, false);
            }
        }
    )
);