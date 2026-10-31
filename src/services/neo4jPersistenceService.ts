import neo4j, { Driver } from 'neo4j-driver';
import {
  CancellationPlaybookRecord,
  CancellationSessionRecord,
  CommitmentGraphResponse,
  CommitmentRecord,
  DetectionAlertRecord,
  GraphEdgeData,
  GraphExecutionMode,
  GraphNodeData,
  TransactionRecord,
} from '../types/debitlens';
import {
  buildCommitmentGraphResponse,
  NotificationInput,
} from '../engine/debitlensEngine';

export interface Neo4jRuntimeStatus {
  configured: boolean;
  connected: boolean;
  uriMasked: string | null;
  database: string;
  lastSuccessfulCheck: string | null;
  status: GraphExecutionMode;
  message: string;
}

const CYPHER_CREATE_CONSTRAINTS = [
  'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
  'CREATE CONSTRAINT account_id_unique IF NOT EXISTS FOR (a:Account) REQUIRE a.id IS UNIQUE',
  'CREATE CONSTRAINT batch_id_unique IF NOT EXISTS FOR (b:ImportBatch) REQUIRE b.id IS UNIQUE',
  'CREATE CONSTRAINT txn_id_unique IF NOT EXISTS FOR (t:Transaction) REQUIRE t.id IS UNIQUE',
  'CREATE CONSTRAINT descriptor_id_unique IF NOT EXISTS FOR (d:Descriptor) REQUIRE d.id IS UNIQUE',
  'CREATE CONSTRAINT merchant_id_unique IF NOT EXISTS FOR (m:Merchant) REQUIRE m.id IS UNIQUE',
  'CREATE CONSTRAINT processor_id_unique IF NOT EXISTS FOR (p:PaymentProcessor) REQUIRE p.id IS UNIQUE',
  'CREATE CONSTRAINT service_id_unique IF NOT EXISTS FOR (s:Service) REQUIRE s.id IS UNIQUE',
  'CREATE CONSTRAINT commitment_id_unique IF NOT EXISTS FOR (c:Commitment) REQUIRE c.id IS UNIQUE',
  'CREATE CONSTRAINT mandate_id_unique IF NOT EXISTS FOR (md:Mandate) REQUIRE md.id IS UNIQUE',
  'CREATE CONSTRAINT rail_id_unique IF NOT EXISTS FOR (r:PaymentRail) REQUIRE r.id IS UNIQUE',
  'CREATE CONSTRAINT notif_id_unique IF NOT EXISTS FOR (n:NotificationEvent) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT playbook_id_unique IF NOT EXISTS FOR (pb:CancellationPlaybook) REQUIRE pb.id IS UNIQUE',
  'CREATE CONSTRAINT session_id_unique IF NOT EXISTS FOR (cs:CancellationSession) REQUIRE cs.id IS UNIQUE',
  'CREATE CONSTRAINT step_id_unique IF NOT EXISTS FOR (st:CancellationStep) REQUIRE st.id IS UNIQUE',
  'CREATE CONSTRAINT evidence_id_unique IF NOT EXISTS FOR (ev:CancellationEvidence) REQUIRE ev.id IS UNIQUE',
  'CREATE CONSTRAINT alert_id_unique IF NOT EXISTS FOR (al:DetectionAlert) REQUIRE al.id IS UNIQUE',
];

const VALID_LABELS = new Set([
  'User',
  'Account',
  'ImportBatch',
  'Transaction',
  'Descriptor',
  'Merchant',
  'PaymentProcessor',
  'Service',
  'Commitment',
  'Mandate',
  'PaymentRail',
  'NotificationEvent',
  'CancellationPlaybook',
  'CancellationSession',
  'CancellationStep',
  'CancellationEvidence',
  'DetectionAlert',
]);

const VALID_REL_TYPES = new Set([
  'USER_OWNS_ACCOUNT',
  'ACCOUNT_HAS_TRANSACTION',
  'IMPORT_BATCH_CONTAINS_TRANSACTION',
  'TRANSACTION_HAS_DESCRIPTOR',
  'DESCRIPTOR_RESOLVES_TO_MERCHANT',
  'TRANSACTION_PROCESSED_BY',
  'MERCHANT_OFFERS_SERVICE',
  'TRANSACTION_SUPPORTS_COMMITMENT',
  'COMMITMENT_FOR_SERVICE',
  'COMMITMENT_AUTHORISED_BY',
  'MANDATE_USES_RAIL',
  'SERVICE_HAS_CANCELLATION_PLAYBOOK',
  'COMMITMENT_HAS_ALERT',
  'ALERT_SUPPORTED_BY',
  'COMMITMENT_HAS_CANCELLATION_SESSION',
  'SESSION_HAS_STEP',
  'SESSION_HAS_EVIDENCE',
  'NOTIFICATION_SUPPORTS_COMMITMENT',
]);

export class Neo4jPersistenceService {
  private driver: Driver | null = null;
  private lastSuccessfulCheck: string | null = null;
  private lastConnected = false;
  private lastError: string | null = null;
  private constraintsInitialised = false;

  public isConfigured(): boolean {
    const enabled = process.env.NEO4J_ENABLED !== 'false';
    const uri = process.env.NEO4J_URI;
    const password = process.env.NEO4J_PASSWORD;
    return Boolean(
      enabled &&
        uri &&
        password &&
        !uri.includes('your-instance-id') &&
        !uri.includes('<instance-id>') &&
        password !== 'your-auradb-password' &&
        password !== '<password>'
    );
  }

  public getDatabaseName(): string {
    return process.env.NEO4J_DATABASE || 'neo4j';
  }

  public getDriver(): Driver | null {
    if (!this.isConfigured()) return null;
    if (!this.driver) {
      this.driver = neo4j.driver(
        process.env.NEO4J_URI!,
        neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!)
      );
    }
    return this.driver;
  }

  public async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  public async checkConnectivity(): Promise<Neo4jRuntimeStatus> {
    const database = this.getDatabaseName();
    const uri = process.env.NEO4J_URI || null;
    const uriMasked = uri ? uri.replace(/\/\/.*@/, '//***@') : null;

    if (!this.isConfigured()) {
      this.lastConnected = false;
      const allowPreview = process.env.ALLOW_LOCAL_PREVIEW !== 'false';
      return {
        configured: false,
        connected: false,
        uriMasked: null,
        database,
        lastSuccessfulCheck: this.lastSuccessfulCheck,
        status: allowPreview ? 'LOCAL_PREVIEW' : 'NOT_CONFIGURED',
        message:
          'NEO4J_URI / NEO4J_PASSWORD are not configured in .env. Running in transparent LOCAL_PREVIEW mode.',
      };
    }

    const drv = this.getDriver();
    if (!drv) {
      return {
        configured: true,
        connected: false,
        uriMasked,
        database,
        lastSuccessfulCheck: this.lastSuccessfulCheck,
        status: 'CONNECTION_FAILED',
        message: 'Failed to instantiate Neo4j driver.',
      };
    }

    try {
      await drv.verifyConnectivity({ database });
      this.lastConnected = true;
      this.lastSuccessfulCheck = new Date().toISOString();
      this.lastError = null;
      return {
        configured: true,
        connected: true,
        uriMasked,
        database,
        lastSuccessfulCheck: this.lastSuccessfulCheck,
        status: 'LIVE_NEO4J',
        message: `Connected to live Neo4j AuraDB (${database}).`,
      };
    } catch (err: any) {
      this.lastConnected = false;
      this.lastError = err?.message || 'Neo4j connectivity check failed';
      return {
        configured: true,
        connected: false,
        uriMasked,
        database,
        lastSuccessfulCheck: this.lastSuccessfulCheck,
        status: 'CONNECTION_FAILED',
        message: `Neo4j connection failed: ${this.lastError}. Falling back to LOCAL_PREVIEW.`,
      };
    }
  }

  public async ensureConstraints(): Promise<void> {
    if (this.constraintsInitialised) return;
    const drv = this.getDriver();
    if (!drv) return;
    const session = drv.session({ database: this.getDatabaseName() });
    try {
      for (const stmt of CYPHER_CREATE_CONSTRAINTS) {
        await session.run(stmt);
      }
      this.constraintsInitialised = true;
    } finally {
      await session.close();
    }
  }

  /**
   * Collects the complete graph across all commitments and unresolved transactions,
   * then persists all 17 node labels and 18 relationship types into Neo4j using UNWIND + MERGE.
   */
  public async syncFullGraphToNeo4j(params: {
    transactions: TransactionRecord[];
    commitments: CommitmentRecord[];
    alerts: DetectionAlertRecord[];
    playbooks: CancellationPlaybookRecord[];
    sessions: CancellationSessionRecord[];
    notifications: NotificationInput[];
  }): Promise<{ persisted: boolean; nodesWritten: number; edgesWritten: number; error?: string }> {
    const connectivity = await this.checkConnectivity();
    if (!connectivity.connected) {
      return {
        persisted: false,
        nodesWritten: 0,
        edgesWritten: 0,
        error: connectivity.message,
      };
    }

    const drv = this.getDriver()!;
    await this.ensureConstraints();

    // Aggregate nodes and edges across all commitments so the full graph is stored in Neo4j
    const allNodesMap = new Map<string, GraphNodeData>();
    const allEdgesMap = new Map<string, GraphEdgeData>();

    for (const cmt of params.commitments) {
      const subGraph = buildCommitmentGraphResponse({
        focusCommitmentId: cmt.id,
        transactions: params.transactions,
        commitments: params.commitments,
        alerts: params.alerts,
        playbooks: params.playbooks,
        sessions: params.sessions,
        notifications: params.notifications,
        executionMode: 'LIVE_NEO4J',
      });
      for (const n of subGraph.nodes) allNodesMap.set(n.id, n);
      for (const e of subGraph.edges) allEdgesMap.set(e.id, e);
    }

    const session = drv.session({ database: this.getDatabaseName() });
    try {
      const nodesByLabel = new Map<
        string,
        Array<{
          id: string;
          title: string;
          subtitle: string;
          status: string;
          confidence: number;
          isCoreCommitmentPath: boolean;
          propsJson: string;
        }>
      >();

      for (const node of allNodesMap.values()) {
        if (!VALID_LABELS.has(node.label)) continue;
        const list = nodesByLabel.get(node.label) || [];
        list.push({
          id: node.id,
          title: node.title,
          subtitle: node.subtitle || '',
          status: node.status,
          confidence: node.confidence ?? 100,
          isCoreCommitmentPath: Boolean(node.isCoreCommitmentPath),
          propsJson: JSON.stringify(node.properties || {}),
        });
        nodesByLabel.set(node.label, list);
      }

      let nodesWritten = 0;
      for (const [label, batch] of nodesByLabel.entries()) {
        await session.run(
          `UNWIND $batch AS item
           MERGE (n:${label} {id: item.id})
           SET n.title = item.title,
               n.subtitle = item.subtitle,
               n.status = item.status,
               n.confidence = item.confidence,
               n.isCoreCommitmentPath = item.isCoreCommitmentPath,
               n.propsJson = item.propsJson,
               n.demoNamespace = 'DEBITLENS_DEMO_V1',
               n.updatedAt = datetime()`,
          { batch }
        );
        nodesWritten += batch.length;
      }

      const edgesByType = new Map<
        string,
        Array<{
          id: string;
          source: string;
          target: string;
          status: string;
          confidence: number;
          matchingMethod: string;
          evidenceType: string;
          sourceReference: string;
          createdAt: string;
          evidenceSummary: string;
          isCoreCommitmentPath: boolean;
        }>
      >();

      for (const edge of allEdgesMap.values()) {
        if (!VALID_REL_TYPES.has(edge.type)) continue;
        const list = edgesByType.get(edge.type) || [];
        list.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          status: edge.status,
          confidence: edge.confidence,
          matchingMethod: edge.matchingMethod,
          evidenceType: edge.evidenceType,
          sourceReference: edge.sourceReference,
          createdAt: edge.createdAt,
          evidenceSummary: edge.evidenceSummary,
          isCoreCommitmentPath: Boolean(edge.isCoreCommitmentPath),
        });
        edgesByType.set(edge.type, list);
      }

      let edgesWritten = 0;
      for (const [relType, batch] of edgesByType.entries()) {
        await session.run(
          `UNWIND $batch AS rel
           MATCH (src {id: rel.source})
           MATCH (dst {id: rel.target})
           MERGE (src)-[r:${relType} {id: rel.id}]->(dst)
           SET r.confidenceScore = rel.confidence,
               r.relationshipStatus = rel.status,
               r.evidenceType = rel.evidenceType,
               r.matchMethod = rel.matchingMethod,
               r.sourceReference = rel.sourceReference,
               r.evidenceSummary = rel.evidenceSummary,
               r.isCoreCommitmentPath = rel.isCoreCommitmentPath,
               r.createdAt = rel.createdAt,
               r.demoNamespace = 'DEBITLENS_DEMO_V1'`,
          { batch }
        );
        edgesWritten += batch.length;
      }

      return { persisted: true, nodesWritten, edgesWritten };
    } catch (err: any) {
      return {
        persisted: false,
        nodesWritten: 0,
        edgesWritten: 0,
        error: err?.message || 'Failed to sync graph to Neo4j',
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Rebuilds demo data in Neo4j safely by deleting only nodes in the DEBITLENS_DEMO_V1 namespace.
   */
  public async rebuildDemoGraphInNeo4j(params: {
    transactions: TransactionRecord[];
    commitments: CommitmentRecord[];
    alerts: DetectionAlertRecord[];
    playbooks: CancellationPlaybookRecord[];
    sessions: CancellationSessionRecord[];
    notifications: NotificationInput[];
  }): Promise<{
    rebuilt: boolean;
    nodesWritten: number;
    edgesWritten: number;
    mode: GraphExecutionMode;
    message: string;
  }> {
    const connectivity = await this.checkConnectivity();
    if (!connectivity.connected) {
      return {
        rebuilt: false,
        nodesWritten: 0,
        edgesWritten: 0,
        mode: connectivity.status,
        message: connectivity.message,
      };
    }

    const drv = this.getDriver()!;
    const session = drv.session({ database: this.getDatabaseName() });
    try {
      await session.run(
        `MATCH (n {demoNamespace: 'DEBITLENS_DEMO_V1'})
         DETACH DELETE n`
      );
    } finally {
      await session.close();
    }

    const syncRes = await this.syncFullGraphToNeo4j(params);
    return {
      rebuilt: syncRes.persisted,
      nodesWritten: syncRes.nodesWritten,
      edgesWritten: syncRes.edgesWritten,
      mode: syncRes.persisted ? 'LIVE_NEO4J' : 'CONNECTION_FAILED',
      message: syncRes.persisted
        ? `Rebuilt Neo4j demo graph (${syncRes.nodesWritten} nodes, ${syncRes.edgesWritten} relationships).`
        : syncRes.error || 'Failed to rebuild Neo4j graph.',
    };
  }

  /**
   * Retrieves the Commitment Graph from live Neo4j if connected; otherwise falls back to transparent LOCAL_PREVIEW.
   */
  public async getCommitmentGraph(params: {
    focusCommitmentId: string | null;
    transactions: TransactionRecord[];
    commitments: CommitmentRecord[];
    alerts: DetectionAlertRecord[];
    playbooks: CancellationPlaybookRecord[];
    sessions: CancellationSessionRecord[];
    notifications: NotificationInput[];
  }): Promise<CommitmentGraphResponse> {
    const connectivity = await this.checkConnectivity();
    if (!connectivity.connected) {
      return buildCommitmentGraphResponse({
        ...params,
        executionMode: connectivity.status,
      });
    }

    const drv = this.getDriver()!;
    const session = drv.session({ database: this.getDatabaseName() });
    try {
      const countRes = await session.run(
        `MATCH (n {demoNamespace: 'DEBITLENS_DEMO_V1'}) RETURN count(n) AS cnt`
      );
      const countVal =
        countRes.records[0]?.get('cnt')?.toNumber?.() ??
        Number(countRes.records[0]?.get('cnt') || 0);
      if (countVal === 0) {
        await this.syncFullGraphToNeo4j(params);
      }

      const baseGraph = buildCommitmentGraphResponse({
        ...params,
        executionMode: 'LIVE_NEO4J',
      });

      const allowedIds = new Set(baseGraph.nodes.map((n) => n.id));
      const cypherRes = await session.run(
        `MATCH (n {demoNamespace: 'DEBITLENS_DEMO_V1'})
         WHERE n.id IN $ids
         OPTIONAL MATCH (n)-[r]->(m {demoNamespace: 'DEBITLENS_DEMO_V1'})
         WHERE m.id IN $ids
         RETURN n.id AS sourceId, labels(n)[0] AS sourceLabel, n.title AS sourceTitle, n.subtitle AS sourceSubtitle,
                n.status AS sourceStatus, n.confidence AS sourceConfidence, n.isCoreCommitmentPath AS sourceCore, n.propsJson AS sourceProps,
                r.id AS relId, type(r) AS relType, r.confidenceScore AS confidence, r.relationshipStatus AS status,
                r.evidenceType AS evidenceType, r.matchMethod AS matchingMethod, r.sourceReference AS sourceReference,
                r.evidenceSummary AS evidenceSummary, r.isCoreCommitmentPath AS relCore, r.createdAt AS createdAt,
                m.id AS targetId`,
        { ids: Array.from(allowedIds) }
      );

      const liveNodesMap = new Map<string, GraphNodeData>();
      const liveEdgesMap = new Map<string, GraphEdgeData>();

      for (const rec of cypherRes.records) {
        const sId = rec.get('sourceId');
        if (sId && !liveNodesMap.has(sId)) {
          let parsedProps: Record<string, string | number | boolean | null> = {};
          try {
            parsedProps = JSON.parse(rec.get('sourceProps') || '{}');
          } catch {
            parsedProps = {};
          }
          const templateNode = baseGraph.nodes.find((n) => n.id === sId);
          liveNodesMap.set(sId, {
            id: sId,
            label: (rec.get('sourceLabel') || templateNode?.label || 'Transaction') as any,
            title: rec.get('sourceTitle') || templateNode?.title || sId,
            subtitle: rec.get('sourceSubtitle') || templateNode?.subtitle || '',
            status: (rec.get('sourceStatus') || templateNode?.status || 'CONFIRMED') as any,
            confidence: Number(rec.get('sourceConfidence') ?? templateNode?.confidence ?? 100),
            isCoreCommitmentPath: Boolean(
              rec.get('sourceCore') ?? templateNode?.isCoreCommitmentPath
            ),
            properties:
              Object.keys(parsedProps).length > 0
                ? parsedProps
                : templateNode?.properties || {},
          });
        }

        const relId = rec.get('relId');
        const targetId = rec.get('targetId');
        if (relId && targetId && !liveEdgesMap.has(relId)) {
          liveEdgesMap.set(relId, {
            id: relId,
            source: sId,
            target: targetId,
            type: rec.get('relType') as any,
            status: (rec.get('status') || 'CONFIRMED') as any,
            confidence: Number(rec.get('confidence') ?? 95),
            matchingMethod: rec.get('matchingMethod') || 'CYPHER_GRAPH_LINK',
            evidenceType: rec.get('evidenceType') || 'GRAPH_EVIDENCE',
            sourceReference: rec.get('sourceReference') || sId,
            createdAt: rec.get('createdAt') || new Date().toISOString(),
            evidenceSummary: rec.get('evidenceSummary') || '',
            isCoreCommitmentPath: Boolean(rec.get('relCore')),
          });
        }
      }

      if (liveNodesMap.size > 0) {
        return {
          ...baseGraph,
          executionMode: 'LIVE_NEO4J',
          nodes: Array.from(liveNodesMap.values()),
          edges: Array.from(liveEdgesMap.values()),
        };
      }

      return baseGraph;
    } catch {
      return buildCommitmentGraphResponse({
        ...params,
        executionMode: 'CONNECTION_FAILED',
      });
    } finally {
      await session.close();
    }
  }
}

export const neo4jPersistenceService = new Neo4jPersistenceService();
