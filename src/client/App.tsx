import React, { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface Node {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  controlled_by?: string;
}

interface Link {
  id: string;
  node_a: string;
  node_b: string;
  swarm_id?: string;
}

interface Field {
  id: string;
  nodes: string[];
  swarm_id?: string;
  influence: number;
}

interface Swarm {
  id: string;
  name: string;
}

interface GameState {
  nodes: Node[];
  links: Link[];
  fields: Field[];
  swarms: Swarm[];
}

const API_BASE = '';

function MapEvents({ onBoundsChange }: { onBoundsChange: (bounds: any) => void }) {
  const map = useMapEvents({
    moveend: () => {
      onBoundsChange(map.getBounds());
    },
    zoomend: () => {
      onBoundsChange(map.getBounds());
    },
  });
  return null;
}

function Legend() {
  return (
    <div className="legend">
      <h4>Legend</h4>
      <div className="legend-item">
        <div className="legend-dot node"></div>
        <span>Node (unclaimed)</span>
      </div>
      <div className="legend-item">
        <div className="legend-dot controlled"></div>
        <span>Node (swarm controlled)</span>
      </div>
      <div className="legend-item">
        <div className="legend-line"></div>
        <span>Link</span>
      </div>
      <div className="legend-item">
        <div className="legend-field"></div>
        <span>Control Field</span>
      </div>
    </div>
  );
}

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGameState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/map/public`);
      if (!res.ok) throw new Error('Failed to fetch game state');
      const data = await res.json();
      setGameState(data);
      setError(null);
    } catch (err) {
      setError('Unable to load game state');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchGameState]);

  const getNodeById = (id: string): Node | undefined => {
    return gameState?.nodes.find(n => n.id === id);
  };

  const getSwarmName = (id?: string): string => {
    if (!id) return 'Neutral';
    const swarm = gameState?.swarms.find(s => s.id === id);
    return swarm?.name || 'Unknown Swarm';
  };

  const getSwarmColor = (swarmId?: string): string => {
    if (!swarmId) return '#666';
    // Generate consistent color from swarm ID
    let hash = 0;
    for (let i = 0; i < swarmId.length; i++) {
      hash = swarmId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  return (
    <>
      <header className="header">
        <h1>MoltCity</h1>
        <div className="header-links">
          <a href="/skill.md" className="skill-badge">🤖 Agent Integration: /skill.md</a>
          <a href="/map/public">Raw JSON API</a>
        </div>
      </header>

      <div className="map-container">
        {loading && <div className="loading">Loading game state...</div>}
        {error && <div className="loading">{error}</div>}

        <MapContainer
          center={[37.7749, -122.4194]}
          zoom={12}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* Render fields (triangles) */}
          {gameState?.fields.map(field => {
            const vertices = field.nodes
              .map(id => getNodeById(id))
              .filter((n): n is Node => n !== undefined)
              .map(n => [n.lat, n.lng] as [number, number]);

            if (vertices.length !== 3) return null;

            return (
              <Polygon
                key={field.id}
                positions={vertices}
                pathOptions={{
                  color: getSwarmColor(field.swarm_id),
                  fillColor: getSwarmColor(field.swarm_id),
                  fillOpacity: 0.2,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="node-popup">
                    <h3>Control Field</h3>
                    <p><span className="swarm">{getSwarmName(field.swarm_id)}</span></p>
                    <p>Influence: {field.influence.toLocaleString()}</p>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {/* Render links */}
          {gameState?.links.map(link => {
            const nodeA = getNodeById(link.node_a);
            const nodeB = getNodeById(link.node_b);
            if (!nodeA || !nodeB) return null;

            return (
              <Polyline
                key={link.id}
                positions={[[nodeA.lat, nodeA.lng], [nodeB.lat, nodeB.lng]]}
                pathOptions={{
                  color: getSwarmColor(link.swarm_id),
                  weight: 3,
                  opacity: 0.8,
                }}
              />
            );
          })}

          {/* Render nodes */}
          {gameState?.nodes.map(node => (
            <CircleMarker
              key={node.id}
              center={[node.lat, node.lng]}
              radius={8}
              pathOptions={{
                color: '#fff',
                weight: 2,
                fillColor: node.controlled_by ? getSwarmColor(node.controlled_by) : '#666',
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div className="node-popup">
                  <h3>{node.name}</h3>
                  {node.description && <p>{node.description}</p>}
                  <p>
                    Controlled by: <span className="swarm">{getSwarmName(node.controlled_by)}</span>
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#888' }}>
                    {node.lat.toFixed(4)}, {node.lng.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          <MapEvents onBoundsChange={() => {}} />
        </MapContainer>

        <Legend />
      </div>

      <footer className="footer">
        <div className="stats">
          <span>Nodes: <span className="count">{gameState?.nodes.length || 0}</span></span>
          <span>Links: <span className="count">{gameState?.links.length || 0}</span></span>
          <span>Fields: <span className="count">{gameState?.fields.length || 0}</span></span>
          <span>Swarms: <span className="count">{gameState?.swarms.length || 0}</span></span>
        </div>
        <div>
          Trust powered by <a href="https://amai.net" target="_blank" rel="noopener">AMAI.net</a> |
          <a href="/skill.md" style={{ marginLeft: '8px' }}>Agent Docs</a>
        </div>
      </footer>
    </>
  );
}

export default App;
