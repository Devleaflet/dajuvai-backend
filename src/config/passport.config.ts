import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { ExtractJwt, Strategy as JwtStrategy } from "passport-jwt";
import { AuthProvider, User } from "../entities/user.entity";
import {
  cookieStateStore,
  OAuthProvider,
  resolveOAuthUser,
} from "../service/oauth.service";
import AppDataSource from "./db.config";
import config from "./env.config";
import { UserDeletionService } from "../service/user-deletion.service";
import {
  isIssuedBeforeCutoff,
  isTokenRevoked,
} from "../service/token-revocation.service";

// Initialize User repository to interact with the database
// This sets up TypeORM to perform CRUD operations on the User entity
const userDB = AppDataSource.getRepository(User);

// Extracts JWT from request cookies
// Purpose: Retrieves the JWT stored in the 'token' cookie for authentication
// How it works: Checks if the request has cookies and returns the 'token' value, or null if not found
const cookieExtractor = (req) => {
  // let token = null;
  // if (req && req.cookies) {
  //     token = req.cookies["token"];
  // }
  // return token;
  let token = null;
  if (req && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  return token;
};

const opts = {
  jwtFromRequest: ExtractJwt.fromExtractors([
    ExtractJwt.fromAuthHeaderAsBearerToken(), // Accepts Authorization: Bearer <token>
    cookieExtractor, // Accepts token from cookie
  ]),
  secretOrKey: config.JWT_SECRET,
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
    // {
    //     jwtFromRequest: cookieExtractor, // Function to extract JWT from cookies
    //     secretOrKey: config.JWT_SECRET, // Secret key for token verification (uses env variable or fallback)
    // },
    opts,
    async (jwt_payload, done) => {
      try {
        // Look up user by ID from JWT payload
        const user = await userDB.findOneBy({ id: jwt_payload.id });
        if (!user) {
          // No user found, authentication fails
          return done(null, false);
        }

        /**
         * Revocation applies here too.
         *
         * This strategy is a second front door — `GET /api/auth/me` and the
         * OAuth routes use it rather than `authMiddleware` — and a token that
         * has been logged out, or that predates a password reset, must be
         * refused at every door. Without this check, logging out revoked the
         * token for one half of the API and not the other.
         */
        if (await isTokenRevoked(jwt_payload.jti)) {
          return done(null, false);
        }

        if (isIssuedBeforeCutoff(jwt_payload.iat, user.tokensValidFrom)) {
          return done(null, false);
        }

        return done(null, user);
      } catch (err) {
        // Handle database or other errors
        return done(err, false);
      }
    },
  ),
);

// Google and Facebook web sign-in. Both share one verify function
// (`resolveOAuthUser`) so their account-linking rules cannot drift, and both
// carry an OAuth `state` nonce (`cookieStateStore`) against login CSRF. Tokens
// are issued in the route callback (`issueUserSessionTokens`), not here.
const verifyOAuth =
  (provider: OAuthProvider) =>
  async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
    try {
      const result = await resolveOAuthUser(
        provider,
        profile,
        userDB,
        () => new UserDeletionService(),
      );
      if ("error" in result) return done(null, false, { message: result.error });
      return done(null, { user: result.user });
    } catch (error) {
      return done(error, false);
    }
  };

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CALLBACK_URL,
      store: cookieStateStore as any,
    },
    verifyOAuth(AuthProvider.GOOGLE),
  ),
);

passport.use(
  new FacebookStrategy(
    {
      clientID: config.FACEBOOK_APP_ID,
      clientSecret: config.FACEBOOK_APP_SECRET,
      callbackURL: config.FACEBOOK_CALLBACK_URL,
      profileFields: ["id", "displayName", "photos", "email"],
      // appsecret_proof on Graph calls, so a leaked user token alone cannot
      // be used with this app's id.
      enableProof: true,
      store: cookieStateStore as any,
    } as any,
    verifyOAuth(AuthProvider.FACEBOOK),
  ),
);
