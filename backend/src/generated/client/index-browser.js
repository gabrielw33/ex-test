
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  username: 'username',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  role: 'role',
  mustResetPassword: 'mustResetPassword',
  isActive: 'isActive',
  preferences: 'preferences',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SystemConfigScalarFieldEnum = {
  id: 'id',
  authEnabled: 'authEnabled',
  authOnboardingCompleted: 'authOnboardingCompleted',
  registrationEnabled: 'registrationEnabled',
  oidcJitProvisioningEnabled: 'oidcJitProvisioningEnabled',
  authLoginRateLimitEnabled: 'authLoginRateLimitEnabled',
  authLoginRateLimitWindowMs: 'authLoginRateLimitWindowMs',
  authLoginRateLimitMax: 'authLoginRateLimitMax',
  bootstrapSetupCodeHash: 'bootstrapSetupCodeHash',
  bootstrapSetupCodeIssuedAt: 'bootstrapSetupCodeIssuedAt',
  bootstrapSetupCodeExpiresAt: 'bootstrapSetupCodeExpiresAt',
  bootstrapSetupCodeFailedAttempts: 'bootstrapSetupCodeFailedAttempts',
  aiProvider: 'aiProvider',
  aiBaseUrl: 'aiBaseUrl',
  aiModel: 'aiModel',
  aiApiKeyEncrypted: 'aiApiKeyEncrypted',
  aiChatgptEnabled: 'aiChatgptEnabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChatGptConnectionScalarFieldEnum = {
  userId: 'userId',
  accountId: 'accountId',
  accessTokenEncrypted: 'accessTokenEncrypted',
  refreshTokenEncrypted: 'refreshTokenEncrypted',
  expiresAt: 'expiresAt',
  accountEmail: 'accountEmail',
  planType: 'planType',
  needsReconnect: 'needsReconnect',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChatGptAuthStateScalarFieldEnum = {
  state: 'state',
  userId: 'userId',
  codeVerifier: 'codeVerifier',
  createdAt: 'createdAt'
};

exports.Prisma.CollectionScalarFieldEnum = {
  id: 'id',
  name: 'name',
  userId: 'userId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrawingScalarFieldEnum = {
  id: 'id',
  name: 'name',
  elements: 'elements',
  appState: 'appState',
  files: 'files',
  preview: 'preview',
  version: 'version',
  userId: 'userId',
  collectionId: 'collectionId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrawingSnapshotScalarFieldEnum = {
  id: 'id',
  drawingId: 'drawingId',
  version: 'version',
  elements: 'elements',
  appState: 'appState',
  files: 'files',
  createdAt: 'createdAt'
};

exports.Prisma.DrawingPermissionScalarFieldEnum = {
  id: 'id',
  drawingId: 'drawingId',
  granteeUserId: 'granteeUserId',
  permission: 'permission',
  hidden: 'hidden',
  createdByUserId: 'createdByUserId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrawingLinkShareScalarFieldEnum = {
  id: 'id',
  drawingId: 'drawingId',
  permission: 'permission',
  tokenHash: 'tokenHash',
  passphraseHash: 'passphraseHash',
  expiresAt: 'expiresAt',
  revokedAt: 'revokedAt',
  failedAttempts: 'failedAttempts',
  lockedUntil: 'lockedUntil',
  lastUsedAt: 'lastUsedAt',
  lastUsedIp: 'lastUsedIp',
  createdByUserId: 'createdByUserId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CollectionShareScalarFieldEnum = {
  id: 'id',
  collectionId: 'collectionId',
  granteeUserId: 'granteeUserId',
  role: 'role',
  createdByUserId: 'createdByUserId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LibraryScalarFieldEnum = {
  id: 'id',
  items: 'items',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PasswordResetTokenScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  token: 'token',
  expiresAt: 'expiresAt',
  used: 'used',
  createdAt: 'createdAt'
};

exports.Prisma.RefreshTokenScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  token: 'token',
  expiresAt: 'expiresAt',
  revoked: 'revoked',
  createdAt: 'createdAt'
};

exports.Prisma.ApiKeyScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  name: 'name',
  keyId: 'keyId',
  tokenHash: 'tokenHash',
  prefix: 'prefix',
  scopes: 'scopes',
  drawingId: 'drawingId',
  lastUsedAt: 'lastUsedAt',
  revokedAt: 'revokedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  action: 'action',
  resource: 'resource',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  details: 'details',
  createdAt: 'createdAt'
};

exports.Prisma.AuthIdentityScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  provider: 'provider',
  issuer: 'issuer',
  subject: 'subject',
  emailAtLink: 'emailAtLink',
  lastLoginAt: 'lastLoginAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrawingFileScalarFieldEnum = {
  drawingId: 'drawingId',
  fileId: 'fileId',
  mimeType: 'mimeType',
  sizeBytes: 'sizeBytes',
  storage: 'storage',
  s3Key: 's3Key',
  data: 'data',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  User: 'User',
  SystemConfig: 'SystemConfig',
  ChatGptConnection: 'ChatGptConnection',
  ChatGptAuthState: 'ChatGptAuthState',
  Collection: 'Collection',
  Drawing: 'Drawing',
  DrawingSnapshot: 'DrawingSnapshot',
  DrawingPermission: 'DrawingPermission',
  DrawingLinkShare: 'DrawingLinkShare',
  CollectionShare: 'CollectionShare',
  Library: 'Library',
  PasswordResetToken: 'PasswordResetToken',
  RefreshToken: 'RefreshToken',
  ApiKey: 'ApiKey',
  AuditLog: 'AuditLog',
  AuthIdentity: 'AuthIdentity',
  DrawingFile: 'DrawingFile'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
