import {
  UserData,
  UserNetworkingServer,
  UserNetworkingServerError,
} from "@mml-io/3d-web-user-networking";
import cors from "cors";
import express from "express";
import enableWs from "express-ws";
import ws from "ws";

import { MMLDocumentsServer } from "./MMLDocumentsServer";
import { websocketDirectoryChangeListener } from "./websocketDirectoryChangeListener";

type UserAuthenticator = {
  generateAuthorizedSessionToken(req: express.Request): Promise<string | null>;
  getClientIdForSessionToken: (sessionToken: string) => {
    id: number;
  } | null;
  onClientConnect(
    clientId: number,
    sessionToken: string,
    userIdentityPresentedOnConnection?: UserData,
  ): Promise<UserData | true | Error> | UserData | true | Error;
  onClientUserIdentityUpdate(clientId: number, userIdentity: UserData): UserData | true | Error;
  onClientDisconnect(clientId: number): void;
};

export type ServerLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export const defaultSessionTokenPlaceholder = "SESSION.TOKEN.PLACEHOLDER";

export type Networked3dWebExperienceServerConfig = {
  networkPath: string;
  webClientServing: {
    indexUrl: string;
    indexContent: string;
    sessionTokenPlaceholder?: string;

    clientBuildDir: string;
    clientUrl: string;
    clientWatchWebsocketPath?: string;
  };
  enableChat?: boolean;
  assetServing?: {
    assetsDir: string;
    assetsUrl: string;
  };
  mmlServing?: {
    documentsWatchPath: string;
    documentsDirectoryRoot: string;
    documentsUrl: string;
  };
  userAuthenticator: UserAuthenticator;
  connectionLimits?: {
    maxConnections?: number;
    maxConnectionsPerIp?: number;
  };
  healthChecks?: {
    livePath?: string;
    readyPath?: string;
    readinessCheck?: () => boolean;
  };
  logger?: ServerLogger;
};

export class Networked3dWebExperienceServer {
  public userNetworkingServer: UserNetworkingServer;

  public mmlDocumentsServer?: MMLDocumentsServer;
  private activeConnections = 0;
  private connectionsByIp = new Map<string, number>();
  private logger: ServerLogger;

  constructor(private config: Networked3dWebExperienceServerConfig) {
    this.logger = config.logger ?? console;
    if (this.config.mmlServing) {
      const { documentsWatchPath, documentsDirectoryRoot } = this.config.mmlServing;
      this.mmlDocumentsServer = new MMLDocumentsServer(documentsDirectoryRoot, documentsWatchPath);
    }

    this.userNetworkingServer = new UserNetworkingServer({
      legacyAdapterEnabled: true,
      onClientConnect: (
        clientId: number,
        sessionToken: string,
        userIdentityPresentedOnConnection?: UserData,
      ): Promise<UserData | true | Error> | UserData | true | Error => {
        return this.config.userAuthenticator.onClientConnect(
          clientId,
          sessionToken,
          userIdentityPresentedOnConnection,
        );
      },
      onClientUserIdentityUpdate: (
        clientId: number,
        userIdentity: UserData,
      ): UserData | true | Error => {
        // Called whenever a user connects or updates their character/identity
        return this.config.userAuthenticator.onClientUserIdentityUpdate(clientId, userIdentity);
      },
      onClientDisconnect: (clientId: number): void => {
        this.config.userAuthenticator.onClientDisconnect(clientId);
      },
    });
  }

  public updateUserCharacter(clientId: number, userData: UserData) {
    console.log(`Initiate server-side update of client ${clientId}`);
    this.userNetworkingServer.updateUserCharacter(clientId, userData);
  }

  public dispose(error?: UserNetworkingServerError) {
    this.userNetworkingServer.dispose(error);
    if (this.mmlDocumentsServer) {
      this.mmlDocumentsServer.dispose();
    }
  }

  registerExpressRoutes(app: enableWs.Application) {
    const livePath = this.config.healthChecks?.livePath ?? "/healthz";
    const readyPath = this.config.healthChecks?.readyPath ?? "/readyz";
    app.get(livePath, (_req, res) => {
      res.status(200).json({ status: "ok" });
    });
    app.get(readyPath, (_req, res) => {
      const isReady = this.config.healthChecks?.readinessCheck?.() ?? true;
      if (isReady) {
        res.status(200).json({ status: "ready" });
      } else {
        res.status(503).json({ status: "not_ready" });
      }
    });

    app.ws(this.config.networkPath, (ws, req) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!this.canAcceptConnection(ip)) {
        ws.close(1008, "Connection limit reached");
        return;
      }
      this.userNetworkingServer.connectClient(ws as unknown as WebSocket);
      this.trackConnection(ws, ip);
    });

    const webClientServing = this.config.webClientServing;
    if (webClientServing) {
      app.get(webClientServing.indexUrl, async (req: express.Request, res: express.Response) => {
        const token = await this.config.userAuthenticator.generateAuthorizedSessionToken(req);
        if (!token) {
          res.send("Error: Could not generate token");
          return;
        }
        const authorizedDemoIndexContent = webClientServing.indexContent.replace(
          webClientServing.sessionTokenPlaceholder || defaultSessionTokenPlaceholder,
          token,
        );
        res.send(authorizedDemoIndexContent);
      });

      app.use(webClientServing.clientUrl, express.static(webClientServing.clientBuildDir));
      if (webClientServing.clientWatchWebsocketPath) {
        websocketDirectoryChangeListener(app, {
          directory: webClientServing.clientBuildDir,
          websocketPath: webClientServing.clientWatchWebsocketPath,
        });
      }
    }

    const mmlDocumentsServer = this.mmlDocumentsServer;
    const mmlServing = this.config.mmlServing;
    // Handle example document sockets
    if (mmlServing && mmlDocumentsServer) {
      app.ws(`${mmlServing.documentsUrl}*`, (ws: ws.WebSocket, req: express.Request) => {
        const path = req.params[0];
        this.logger.info("document requested", { path });
        mmlDocumentsServer.handle(path, ws);
      });
    }

    if (this.config.assetServing) {
      // Serve assets with CORS allowing all origins
      app.use(
        this.config.assetServing.assetsUrl,
        cors(),
        express.static(this.config.assetServing.assetsDir),
      );
    }
  }

  private canAcceptConnection(ip: string): boolean {
    const limits = this.config.connectionLimits;
    if (!limits) {
      return true;
    }

    if (limits.maxConnections !== undefined && this.activeConnections >= limits.maxConnections) {
      this.logger.warn("Connection rejected: maxConnections reached");
      return false;
    }

    if (limits.maxConnectionsPerIp !== undefined) {
      const current = this.connectionsByIp.get(ip) ?? 0;
      if (current >= limits.maxConnectionsPerIp) {
        this.logger.warn("Connection rejected: maxConnectionsPerIp reached", { ip });
        return false;
      }
    }

    return true;
  }

  private trackConnection(socket: ws.WebSocket, ip: string) {
    this.activeConnections += 1;
    this.connectionsByIp.set(ip, (this.connectionsByIp.get(ip) ?? 0) + 1);

    socket.on("close", () => {
      this.activeConnections = Math.max(0, this.activeConnections - 1);
      const current = (this.connectionsByIp.get(ip) ?? 1) - 1;
      if (current <= 0) {
        this.connectionsByIp.delete(ip);
      } else {
        this.connectionsByIp.set(ip, current);
      }
    });
  }
}
