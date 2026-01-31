import { db, schema } from '../db/index.js';
import { eq, and, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { triangleArea, calculateInfluence } from './geometry.js';

export async function detectAndCreateFields(swarmId: string): Promise<void> {
  // Get all nodes controlled by this swarm
  const nodes = await db.query.nodes.findMany({
    where: eq(schema.nodes.controlledBy, swarmId),
  });

  // Get all links for this swarm
  const links = await db.query.links.findMany({
    where: eq(schema.links.swarmId, swarmId),
  });

  // Build adjacency map
  const adjacent = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacent.set(node.id, new Set());
  }
  for (const link of links) {
    adjacent.get(link.nodeA)?.add(link.nodeB);
    adjacent.get(link.nodeB)?.add(link.nodeA);
  }

  // Find all triangles
  const existingFields = await db.query.fields.findMany({
    where: eq(schema.fields.swarmId, swarmId),
  });
  const existingSet = new Set(
    existingFields.map((f) => [f.node1, f.node2, f.node3].sort().join('-'))
  );

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      for (let k = j + 1; k < nodes.length; k++) {
        const a = nodes[i];
        const b = nodes[j];
        const c = nodes[k];

        // Check if all three pairs are connected
        const abConnected = adjacent.get(a.id)?.has(b.id);
        const bcConnected = adjacent.get(b.id)?.has(c.id);
        const acConnected = adjacent.get(a.id)?.has(c.id);

        if (abConnected && bcConnected && acConnected) {
          const key = [a.id, b.id, c.id].sort().join('-');

          if (!existingSet.has(key)) {
            // Calculate influence
            const area = triangleArea(
              { lat: a.lat, lng: a.lng },
              { lat: b.lat, lng: b.lng },
              { lat: c.lat, lng: c.lng }
            );
            const influence = calculateInfluence(area);

            // Create field
            await db.insert(schema.fields).values({
              id: nanoid(),
              node1: a.id,
              node2: b.id,
              node3: c.id,
              swarmId,
              influence,
            });

            existingSet.add(key);
          }
        }
      }
    }
  }
}

export async function removeInvalidFields(): Promise<void> {
  // Remove fields where nodes/links no longer exist or belong to different swarms
  const fields = await db.query.fields.findMany();

  for (const field of fields) {
    const [n1, n2, n3] = await Promise.all([
      db.query.nodes.findFirst({ where: eq(schema.nodes.id, field.node1) }),
      db.query.nodes.findFirst({ where: eq(schema.nodes.id, field.node2) }),
      db.query.nodes.findFirst({ where: eq(schema.nodes.id, field.node3) }),
    ]);

    // Check if all nodes still belong to the same swarm
    const allSameSwarm =
      n1?.controlledBy === field.swarmId &&
      n2?.controlledBy === field.swarmId &&
      n3?.controlledBy === field.swarmId;

    if (!allSameSwarm) {
      await db.delete(schema.fields).where(eq(schema.fields.id, field.id));
    }
  }
}
