import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { getItemAccent } from '@/lib/knowledge';
import { MindMapEdge, MindMapNode } from '@/types/knowledge';

const CANVAS_W = 1200;
const CANVAS_H = 800;
const NODE_R = 26;

type Props = {
  edges: MindMapEdge[];
  nodes: MindMapNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
};

type SimNode = MindMapNode & { x: number; y: number; fx?: number | null; fy?: number | null };
type SimLink = { source: SimNode; target: SimNode; label?: string };

export function MindMapCanvas({ edges, nodes, selectedId, onSelect }: Props) {
  const layoutRef = useRef<{ nodes: SimNode[]; links: SimLink[] }>({ nodes: [], links: [] });
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!nodes.length) {
      layoutRef.current = { nodes: [], links: [] };
      forceRender((tick) => tick + 1);
      return;
    }

    const spread = Math.min(260, 60 + nodes.length * 18);
    const simNodes: SimNode[] = nodes.map((node, index) => ({
      ...node,
      x: CANVAS_W / 2 + Math.cos((index / nodes.length) * 2 * Math.PI) * spread,
      y: CANVAS_H / 2 + Math.sin((index / nodes.length) * 2 * Math.PI) * spread,
    }));
    const simLinks = edges.map((edge) => ({
      source: edge.from as unknown as SimNode,
      target: edge.to as unknown as SimNode,
      label: edge.label,
    }));

    layoutRef.current = { nodes: simNodes, links: simLinks };

    const padding = NODE_R + 20;

    const simulation = forceSimulation(simNodes)
      .force(
        'link',
        forceLink(simLinks)
          .id((node: any) => node.id)
          .distance(150)
          .strength(0.7)
      )
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(CANVAS_W / 2, CANVAS_H / 2))
      .force('x', forceX(CANVAS_W / 2).strength(0.06))
      .force('y', forceY(CANVAS_H / 2).strength(0.06))
      .force('collide', forceCollide(NODE_R + 14))
      .alpha(1)
      .alphaDecay(0.035)
      .on('tick', () => {
        // Hard-clamp every node inside canvas bounds so none escape off-screen.
        for (const node of simNodes) {
          node.x = Math.max(padding, Math.min(CANVAS_W - padding, node.x));
          node.y = Math.max(padding, Math.min(CANVAS_H - padding, node.y));
        }
        forceRender((tick) => tick + 1);
      });

    simRef.current = simulation;

    return () => {
      simulation.stop();
      simRef.current = null;
    };
  }, [nodes, edges]);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const baseScale = useSharedValue(1);
  const baseTx = useSharedValue(0);
  const baseTy = useSharedValue(0);

  // Re-center whenever the node set changes.
  useEffect(() => {
    centeredRef.current = false;
  }, [nodes]);

  // Center the canvas in the container on first layout.
  const centeredRef = useRef(false);
  const handleLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    if (centeredRef.current) return;
    centeredRef.current = true;
    const { width, height } = event.nativeEvent.layout;
    tx.value = width / 2 - CANVAS_W / 2;
    ty.value = height / 2 - CANVAS_H / 2;
    baseTx.value = tx.value;
    baseTy.value = ty.value;
  };

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      baseScale.value = scale.value;
    })
    .onUpdate((event) => {
      const next = baseScale.value * event.scale;
      scale.value = Math.min(4, Math.max(0.3, next));
    });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      baseTx.value = tx.value;
      baseTy.value = ty.value;
    })
    .onUpdate((event) => {
      tx.value = baseTx.value + event.translationX;
      ty.value = baseTy.value + event.translationY;
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const viewportStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const handleNodePress = (id: string) => {
    onSelect(id);
    // Re-warm the simulation slightly so the focus animation feels alive.
    if (simRef.current) {
      simRef.current.alpha(0.4).restart();
    }
  };

  const layout = layoutRef.current;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.viewport, viewportStyle]}>
          <Svg width={CANVAS_W} height={CANVAS_H}>
            {layout.links.map((link, index) => {
              const isAdjacent =
                selectedId && (link.source.id === selectedId || link.target.id === selectedId);
              const dim = selectedId && !isAdjacent;
              const midX = (link.source.x + link.target.x) / 2;
              const midY = (link.source.y + link.target.y) / 2;
              return (
                <React.Fragment key={`edge-${index}`}>
                  <Line
                    x1={link.source.x}
                    y1={link.source.y}
                    x2={link.target.x}
                    y2={link.target.y}
                    stroke={isAdjacent ? '#123524' : '#C7CCDA'}
                    strokeWidth={isAdjacent ? 2.5 : 1}
                    opacity={dim ? 0.35 : 1}
                  />
                  {isAdjacent && link.label ? (
                    <SvgText
                      x={midX}
                      y={midY - 4}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight="600"
                      fill="#475467">
                      {link.label}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
            {layout.nodes.map((node) => {
              const isSelected = node.id === selectedId;
              const accent = getItemAccent(node.type);
              const label = node.label.length > 16 ? `${node.label.slice(0, 15)}…` : node.label;
              const dim = selectedId && !isSelected;
              return (
                <G key={node.id} onPress={() => handleNodePress(node.id)}>
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? NODE_R + 5 : NODE_R}
                    fill={accent}
                    stroke={isSelected ? '#101828' : '#FFFFFF'}
                    strokeWidth={isSelected ? 3 : 2}
                    opacity={dim ? 0.6 : 1}
                  />
                  <SvgText
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="700"
                    fill="#FFFFFF">
                    {node.type.toUpperCase()}
                  </SvgText>
                  <SvgText
                    x={node.x}
                    y={node.y + NODE_R + 18}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight="700"
                    fill="#101828"
                    opacity={dim ? 0.7 : 1}>
                    {label}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 320,
    backgroundColor: '#FBFAF4',
    overflow: 'hidden',
    borderRadius: 24,
  },
  viewport: {
    width: CANVAS_W,
    height: CANVAS_H,
  },
});
