import { ArrowLeft, ArrowRight, Check, Circle, Loader2, Map, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Background, Controls, MiniMap, ReactFlow, Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { EmptyState } from '../components/feedback/EmptyState'
import { LoadingState } from '../components/feedback/LoadingState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { roadmapService } from '../services/api-client'
import { classifyAiError } from '../services/ai-error'
import { ApiError } from '../services/http-client'
import type { RoadmapDetail, RoadmapGraphData, RoadmapGraphTopic, RoadmapTopicStatus } from '../services/contracts/roadmaps'

type TopicNodeData = RoadmapGraphTopic & { overriddenStatus?: RoadmapTopicStatus }
type TopicNode = Node<TopicNodeData, 'topic'>

const statusOptions: RoadmapTopicStatus[] = ['Not started', 'In progress', 'Completed', 'Known']

export function RoadmapDetailPage() {
  const { roadmapId } = useParams()
  const [roadmap, setRoadmap] = useState<RoadmapDetail>()
  const [graph, setGraph] = useState<RoadmapGraphData>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    if (!roadmapId) return
    try {
      const [value, graphValue] = await Promise.all([roadmapService.getRoadmap(roadmapId), roadmapService.getGraph?.(roadmapId)])
      setRoadmap(value)
      setGraph(graphValue)
      setLoadError('')
    } catch {
      setLoadError('This roadmap could not be loaded. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [roadmapId])

  useEffect(() => { setLoading(true); void load() }, [load])

  // While the AI model writes the roadmap, follow its progress.
  const generating = roadmap?.status === 'generating'
  useEffect(() => {
    if (!generating) return
    const timer = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(timer)
  }, [generating, load])

  if (loading) return <LoadingState label="Loading roadmap" />
  if (loadError) return <EmptyState title="Roadmap unavailable" text={loadError} action={<button className="button button-secondary" onClick={() => { setLoading(true); void load() }}>Try again</button>} />
  if (!roadmap) return <EmptyState title="Roadmap not found" text="This learning path may no longer be available." action={<Link className="button button-secondary" to="/roadmaps">Back to roadmaps</Link>} />
  if (roadmap.status === 'generating' || roadmap.status === 'failed') return <GenerationState roadmap={roadmap} onChanged={(next) => setRoadmap(next)} />
  return <RoadmapWorkspace roadmap={roadmap} graph={graph} onChanged={load} />
}

function GenerationState({ roadmap, onChanged }: { roadmap: RoadmapDetail; onChanged: (roadmap: RoadmapDetail) => void }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const failed = roadmap.status === 'failed'
  async function retry() {
    if (!roadmapService.retryRoadmap) return
    setBusy(true); setError('')
    try { onChanged(await roadmapService.retryRoadmap(roadmap.id)) } catch (err) { setError(errorText(err) || 'Could not start again.') } finally { setBusy(false) }
  }
  async function remove() {
    if (!roadmapService.deleteRoadmap) return
    setBusy(true)
    try { await roadmapService.deleteRoadmap(roadmap.id); navigate('/roadmaps') } catch { setError('Could not delete this roadmap.'); setBusy(false) }
  }
  const percent = Math.round((roadmap.generationProgress ?? 0) * 100)
  return <div className="page-stack roadmap-detail-page">
    <Link to="/roadmaps" className="back-link"><ArrowLeft size={15} /> All roadmaps</Link>
    <section className={`roadmap-detail-hero roadmap-${roadmap.color}`}><div className="roadmap-icon"><Map size={24} /></div><div><span className="eyebrow">{roadmap.category} · {roadmap.source}</span><h2>{roadmap.role}</h2><p>{failed ? 'This roadmap could not be generated.' : 'The local AI model is drafting the topics, their order and prerequisites.'}</p></div></section>
    <section className="progress-panel roadmap-generation-panel" role="status">
      {failed
        ? <><h2>Generation failed</h2><p>{roadmap.error || 'The AI model could not finish this roadmap.'}</p><div className="dialog-actions"><button className="button" disabled={busy} onClick={() => void retry()}>Try again</button><button className="button button-ghost" disabled={busy} onClick={() => void remove()}><Trash2 size={14} /> Delete</button></div></>
        : <><h2><Loader2 size={18} className="spin" /> {roadmap.stage || 'Preparing'}</h2><ProgressBar value={percent} color="purple" /><p className="generation-note">On the local model this takes a few minutes. You can leave this page; the roadmap keeps generating and appears in your library when it is ready.</p></>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  </div>
}

function RoadmapWorkspace({ roadmap, graph: serviceGraph, onChanged }: { roadmap: RoadmapDetail; graph?: RoadmapGraphData; onChanged: () => Promise<void> }) {
  const navigate = useNavigate()
  const graph = useMemo(() => serviceGraph ?? createFallbackGraph(roadmap), [roadmap, serviceGraph])
  const [selectedId, setSelectedId] = useState(graph.topics[0]?.id)
  // Optimistic marks until the server answers with the recomputed status.
  const [pending, setPending] = useState<Record<string, RoadmapTopicStatus>>({})
  const [studyError, setStudyError] = useState('')
  const [starting, setStarting] = useState(false)
  const selectedTopic = graph.topics.find((topic) => topic.id === selectedId)
  const titles = useMemo(() => Object.fromEntries(graph.topics.map((topic) => [topic.id, topic.title])), [graph])
  const statusFor = (topic: RoadmapGraphTopic) => pending[topic.id] ?? topic.status
  const nodes = useMemo<TopicNode[]>(() => graph.topics.map((topic) => ({ id: topic.id, type: 'topic', position: topic.position, data: { ...topic, overriddenStatus: pending[topic.id] } })), [graph, pending])
  const edges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({ ...edge, type: 'smoothstep', animated: false })), [graph])

  async function saveStatus(topic: RoadmapGraphTopic, status: RoadmapTopicStatus | null) {
    if (status) setPending((current) => ({ ...current, [topic.id]: status }))
    try {
      await roadmapService.overrideNodeStatus?.(roadmap.id, topic.id, status)
      await onChanged()
    } catch (error) {
      console.error(error)
    } finally {
      setPending((current) => { const next = { ...current }; delete next[topic.id]; return next })
    }
  }

  async function handleStudy() {
    if (!selectedTopic || !roadmapService.startNodeSession) return
    setStarting(true); setStudyError('')
    try {
      const session = await roadmapService.startNodeSession(roadmap.id, selectedTopic.id)
      navigate(`/study/${session.sessionId}`, { state: { roadmapId: roadmap.id, topicId: selectedTopic.id, topic: selectedTopic.title } })
    } catch (error) {
      setStudyError(errorText(error) || 'The study session could not be started. Try again.')
      setStarting(false)
    }
  }

  async function removeRoadmap() {
    if (!roadmapService.deleteRoadmap || !window.confirm('Delete this generated roadmap? Your marks on it are deleted too.')) return
    await roadmapService.deleteRoadmap(roadmap.id)
    navigate('/roadmaps')
  }

  const generated = roadmap.source === 'AI-generated'
  return <div className="page-stack roadmap-detail-page">
    <Link to="/roadmaps" className="back-link"><ArrowLeft size={15} /> All roadmaps</Link>
    <section className={`roadmap-detail-hero roadmap-${roadmap.color}`}><div className="roadmap-icon"><Map size={24} /></div><div><span className="eyebrow">{roadmap.category} · {roadmap.source}</span><h2>{roadmap.role}</h2><p>{roadmap.description}</p></div>{generated && roadmapService.deleteRoadmap && <button className="button button-ghost roadmap-delete" onClick={() => void removeRoadmap()}><Trash2 size={14} /> Delete</button>}</section>
    <div className="roadmap-detail-grid roadmap-graph-grid">
      <main className="progress-panel roadmap-graph-panel"><div className="section-heading"><div><span className="eyebrow">Prerequisite map</span><h2>Follow the connections</h2></div><div className="roadmap-graph-legend"><span><i className="legend-core" /> Core</span><span><i className="legend-optional" /> Optional</span></div></div><p className="panel-intro">Select a topic to see its evidence and prerequisites. Topics move forward as you study them, here or in your own courses.</p><div className="roadmap-flow"><ReactFlow nodes={nodes} edges={edges} nodeTypes={{ topic: TopicNode }} onNodeClick={(_, node) => setSelectedId(node.id)} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.3} maxZoom={1.3} nodesConnectable={false}><Background color="var(--line)" gap={22} size={1} /><Controls showInteractive={false} /><MiniMap nodeColor={(node) => node.data.optional ? 'var(--lilac)' : 'var(--forest)'} maskColor="rgba(247,243,235,.72)" /></ReactFlow></div></main>
      <aside className="progress-panel roadmap-topic-detail">{selectedTopic ? <TopicDetail topic={selectedTopic} titles={titles} status={statusFor(selectedTopic)} starting={starting} studyError={studyError} onStatusChange={(status) => void saveStatus(selectedTopic, status)} onReset={() => void saveStatus(selectedTopic, null)} onStudy={() => void handleStudy()} /> : <div className="inline-empty">Select a topic to see its details.</div>}</aside>
    </div>
    <section className="progress-panel roadmap-detail-footer"><div><span className="eyebrow">Roadmap note</span><p>{roadmap.note}</p></div><div className="roadmap-progress-summary"><strong>{roadmap.progress}%</strong><span>of core topics</span><ProgressBar value={roadmap.progress} color={roadmap.color === 'orange' ? 'orange' : roadmap.color === 'green' ? 'green' : 'purple'} /></div></section>
  </div>
}

function TopicNode({ data, selected }: NodeProps<TopicNode>) {
  const status = data.overriddenStatus ?? data.status
  return <div className={`roadmap-flow-node ${data.optional ? 'optional' : 'core'} ${statusClass(status)} ${selected ? 'selected' : ''}`}><Handle type="target" position={Position.Left} /><div className="flow-node-heading"><span>{data.optional ? 'Optional' : 'Core'}</span><StatusGlyph status={status} /></div><strong>{data.title}</strong><div className="flow-node-progress"><span style={{ width: `${data.progress}%` }} /></div><small>{status}</small><Handle type="source" position={Position.Right} /></div>
}

function TopicDetail({ topic, titles, status, starting, studyError, onStatusChange, onReset, onStudy }: { topic: RoadmapGraphTopic; titles: Record<string, string>; status: RoadmapTopicStatus; starting: boolean; studyError: string; onStatusChange: (status: RoadmapTopicStatus) => void; onReset: () => void; onStudy: () => void }) {
  return <div className="topic-detail-content">
    <div className="topic-detail-heading"><div><span className={`status-label ${statusClass(status)}`}>{status}</span><h2>{topic.title}</h2><span className="eyebrow">{topic.optional ? 'Optional topic' : 'Core topic'}</span></div><Sparkles size={18} className="section-icon" /></div>
    {topic.description && <p className="topic-description">{topic.description}</p>}
    <div className="topic-detail-section"><span className="eyebrow">Evidence</span><p className="detail-muted">{topic.evidenceSummary || 'No study evidence yet for this topic.'}</p>{topic.conceptName && <p className="detail-muted">Connected to <strong>{topic.conceptName}</strong> in your courses, so studying it there counts here too.</p>}</div>
    <div className="topic-detail-section"><span className="eyebrow">Prerequisites</span>{topic.prerequisites.length ? <ul>{topic.prerequisites.map((item) => <li key={item}>{titles[item] ?? item}</li>)}</ul> : <p className="detail-muted">Starting point — no prerequisites.</p>}</div>
    {topic.resources.length > 0 && <div className="topic-detail-section"><span className="eyebrow">Kinds of resources to look for</span><ul>{topic.resources.map((resource) => <li key={resource}>{resource}</li>)}</ul></div>}
    <div className="topic-detail-section"><label className="topic-status-label"><span className="eyebrow">Mark status</span><select value={status} onChange={(event) => onStatusChange(event.target.value as RoadmapTopicStatus)}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></label>{topic.manualOverride && <button className="reset-status" onClick={onReset}><RotateCcw size={13} /> Use the evidence instead</button>}</div>
    <button className="button topic-study-button" onClick={onStudy} disabled={starting}>{starting ? <><Loader2 size={15} className="spin" /> Starting…</> : <>Study this topic <ArrowRight size={15} /></>}</button>
    {studyError && <p className="form-error" role="alert">{studyError}</p>}
  </div>
}

function StatusGlyph({ status }: { status: RoadmapTopicStatus }) {
  if (status === 'Completed' || status === 'Known') return <Check size={13} />
  return <Circle size={12} />
}

function statusClass(status: RoadmapTopicStatus) {
  return status.toLowerCase().replaceAll(' ', '-')
}

function createFallbackGraph(roadmap: RoadmapDetail): RoadmapGraphData {
  return { topics: roadmap.topics.map((topic, index) => ({ id: topic.id, title: topic.name, description: `Build practical confidence with ${topic.name.toLowerCase()}.`, optional: Boolean(topic.optional), status: topic.completed ? 'Completed' : 'Not started', progress: topic.completed ? 100 : 0, prerequisites: index ? [roadmap.topics[index - 1].id] : [], resources: [`${roadmap.role} study guide`], position: { x: (index % 3) * 260, y: Math.floor(index / 3) * 150 } })), edges: roadmap.topics.slice(1).map((topic, index) => ({ id: `fallback-${index}`, source: roadmap.topics[index].id, target: topic.id })) }
}

/** Conflicts (409) carry a specific explanation from the server, e.g. a generation already running. */
function errorText(error: unknown) {
  return error instanceof ApiError && error.code === 'conflict' && error.message ? error.message : classifyAiError(error).userMessage
}
