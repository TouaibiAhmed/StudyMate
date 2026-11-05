import { ArrowLeft, ArrowRight, Check, Circle, LockKeyhole, Map, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Background, Controls, MiniMap, ReactFlow, Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { roadmapService } from '../services/api-client'
import { roadmapGraphData } from '../services/mock/roadmap-graph-data'
import type { RoadmapDetail, RoadmapGraphData, RoadmapGraphTopic, RoadmapTopicStatus } from '../services/contracts/roadmaps'

type TopicNodeData = RoadmapGraphTopic & { overriddenStatus?: RoadmapTopicStatus }
type TopicNode = Node<TopicNodeData, 'topic'>

const statusOptions: RoadmapTopicStatus[] = ['Not started', 'In progress', 'Completed', 'Known']

export function RoadmapDetailPage() {
  const { roadmapId } = useParams()
  const [roadmap, setRoadmap] = useState<RoadmapDetail>()
  useEffect(() => { if (roadmapId) void roadmapService.getRoadmap(roadmapId).then(setRoadmap) }, [roadmapId])
  if (!roadmap) return <EmptyState title="Roadmap not found" text="This learning path may no longer be available." />
  return <RoadmapWorkspace roadmap={roadmap} />
}

function RoadmapWorkspace({ roadmap }: { roadmap: RoadmapDetail }) {
  const navigate = useNavigate()
  const graph = useMemo(() => roadmapGraphData[roadmap.id] ?? createFallbackGraph(roadmap), [roadmap])
  const [selectedId, setSelectedId] = useState(graph.topics[0]?.id)
  const [overrides, setOverrides] = useState<Record<string, RoadmapTopicStatus>>({})
  const selectedTopic = graph.topics.find((topic) => topic.id === selectedId)
  const statusFor = (topic: RoadmapGraphTopic) => overrides[topic.id] ?? topic.status
  const nodes = useMemo<TopicNode[]>(() => graph.topics.map((topic) => ({ id: topic.id, type: 'topic', position: topic.position, data: { ...topic, overriddenStatus: overrides[topic.id] } })), [graph, overrides])
  const edges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({ ...edge, type: 'smoothstep', animated: false })), [graph])

  function setTopicStatus(status: RoadmapTopicStatus) {
    if (selectedTopic) setOverrides((current) => ({ ...current, [selectedTopic.id]: status }))
  }

  function resetTopicStatus() {
    if (selectedTopic) setOverrides((current) => { const next = { ...current }; delete next[selectedTopic.id]; return next })
  }

  return <div className="page-stack roadmap-detail-page">
    <Link to="/roadmaps" className="back-link"><ArrowLeft size={15} /> All roadmaps</Link>
    <section className={`roadmap-detail-hero roadmap-${roadmap.color}`}><div className="roadmap-icon"><Map size={24} /></div><div><span className="eyebrow">{roadmap.category} · {roadmap.source}</span><h2>{roadmap.role}</h2><p>{roadmap.description}</p></div></section>
    <div className="roadmap-detail-grid roadmap-graph-grid">
      <main className="progress-panel roadmap-graph-panel"><div className="section-heading"><div><span className="eyebrow">Prerequisite map</span><h2>Follow the connections</h2></div><div className="roadmap-graph-legend"><span><i className="legend-core" /> Core</span><span><i className="legend-optional" /> Optional</span></div></div><p className="panel-intro">Select a topic to inspect its evidence and prerequisites. Complete the connections before jumping ahead.</p><div className="roadmap-flow"><ReactFlow nodes={nodes} edges={edges} nodeTypes={{ topic: TopicNode }} onNodeClick={(_, node) => setSelectedId(node.id)} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.45} maxZoom={1.3} nodesConnectable={false}><Background color="var(--line)" gap={22} size={1} /><Controls showInteractive={false} /><MiniMap nodeColor={(node) => node.data.optional ? 'var(--lilac)' : 'var(--forest)'} maskColor="rgba(247,243,235,.72)" /></ReactFlow></div></main>
      <aside className="progress-panel roadmap-topic-detail">{selectedTopic ? <TopicDetail topic={selectedTopic} status={statusFor(selectedTopic)} overridden={Boolean(overrides[selectedTopic.id])} onStatusChange={setTopicStatus} onReset={resetTopicStatus} onStudy={() => navigate('/study/session-general-01', { state: { roadmapId: roadmap.id, topicId: selectedTopic.id, topic: selectedTopic.title } })} /> : <div className="inline-empty">Select a topic to see its details.</div>}</aside>
    </div>
    <section className="progress-panel roadmap-detail-footer"><div><span className="eyebrow">Roadmap note</span><p>{roadmap.note}</p></div><div className="roadmap-progress-summary"><strong>{roadmap.progress}%</strong><span>overall progress</span><ProgressBar value={roadmap.progress} color={roadmap.color === 'orange' ? 'orange' : roadmap.color === 'green' ? 'green' : 'purple'} /></div></section>
  </div>
}

function TopicNode({ data, selected }: NodeProps<TopicNode>) {
  const status = data.overriddenStatus ?? data.status
  return <div className={`roadmap-flow-node ${data.optional ? 'optional' : 'core'} ${statusClass(status)} ${selected ? 'selected' : ''}`}><Handle type="target" position={Position.Left} /><div className="flow-node-heading"><span>{data.optional ? 'Optional' : 'Core'}</span><StatusGlyph status={status} /></div><strong>{data.title}</strong><div className="flow-node-progress"><span style={{ width: `${data.progress}%` }} /></div><small>{status}</small><Handle type="source" position={Position.Right} /></div>
}

function TopicDetail({ topic, status, overridden, onStatusChange, onReset, onStudy }: { topic: RoadmapGraphTopic; status: RoadmapTopicStatus; overridden: boolean; onStatusChange: (status: RoadmapTopicStatus) => void; onReset: () => void; onStudy: () => void }) {
  return <div className="topic-detail-content"><div className="topic-detail-heading"><div><span className={`status-label ${statusClass(status)}`}>{status}</span><h2>{topic.title}</h2><span className="eyebrow">{topic.optional ? 'Optional topic' : 'Core topic'}</span></div><Sparkles size={18} className="section-icon" /></div><p className="topic-description">{topic.description}</p><div className="topic-detail-section"><span className="eyebrow">Prerequisites</span>{topic.prerequisites.length ? <ul>{topic.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="detail-muted">Starting point — no prerequisites.</p>}</div><div className="topic-detail-section"><span className="eyebrow">Suggested resources</span><ul>{topic.resources.map((resource) => <li key={resource}>{resource}</li>)}</ul></div><div className="topic-detail-section"><label className="topic-status-label"><span className="eyebrow">Override status</span><select value={status} onChange={(event) => onStatusChange(event.target.value as RoadmapTopicStatus)}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></label>{overridden && <button className="reset-status" onClick={onReset}><RotateCcw size={13} /> Reset to roadmap status</button>}</div><button className="button topic-study-button" onClick={onStudy}><LockKeyhole size={15} /> Study this topic <ArrowRight size={15} /></button></div>
}

function StatusGlyph({ status }: { status: RoadmapTopicStatus }) {
  if (status === 'Completed' || status === 'Known') return <Check size={13} />
  return <Circle size={12} />
}

function statusClass(status: RoadmapTopicStatus) {
  return status.toLowerCase().replaceAll(' ', '-')
}

function createFallbackGraph(roadmap: RoadmapDetail): RoadmapGraphData {
  return { topics: roadmap.topics.map((topic, index) => ({ id: topic.id, title: topic.name, description: `Build practical confidence with ${topic.name.toLowerCase()}.`, optional: Boolean(topic.optional), status: topic.completed ? 'Completed' : 'Not started', progress: topic.completed ? 100 : 0, prerequisites: index ? [roadmap.topics[index - 1].name] : [], resources: [`${roadmap.role} study guide`], position: { x: (index % 3) * 260, y: Math.floor(index / 3) * 150 } })), edges: roadmap.topics.slice(1).map((topic, index) => ({ id: `fallback-${index}`, source: roadmap.topics[index].id, target: topic.id })) }
}
