import { ArrowLeft, Check, Circle, Map } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { roadmapService } from '../services/api-client'
import type { RoadmapDetail } from '../services/contracts/roadmaps'

export function RoadmapDetailPage() {
  const { roadmapId } = useParams()
  const [roadmap, setRoadmap] = useState<RoadmapDetail>()
  useEffect(() => { if (roadmapId) void roadmapService.getRoadmap(roadmapId).then(setRoadmap) }, [roadmapId])
  if (!roadmap) return <EmptyState title="Roadmap not found" text="This learning path may no longer be available." />
  return <div className="page-stack roadmap-detail-page"><Link to="/roadmaps" className="back-link"><ArrowLeft size={15} /> All roadmaps</Link><section className={`roadmap-detail-hero roadmap-${roadmap.color}`}><div className="roadmap-icon"><Map size={24} /></div><div><span className="eyebrow">{roadmap.category} · {roadmap.source}</span><h2>{roadmap.role}</h2><p>{roadmap.description}</p></div></section><div className="roadmap-detail-grid"><main className="progress-panel"><div className="section-heading"><div><span className="eyebrow">Your path</span><h2>{roadmap.topicCount} topics</h2></div><strong>{roadmap.progress}%</strong></div><ProgressBar value={roadmap.progress} color={roadmap.color === 'orange' ? 'orange' : roadmap.color === 'green' ? 'green' : 'purple'} /><div className="roadmap-topic-list">{roadmap.topics.map((topic) => <div className={`roadmap-topic ${topic.optional ? 'optional' : ''}`} key={topic.id}>{topic.completed ? <Check size={16} /> : <Circle size={16} />}<span>{topic.name}</span>{topic.optional && <small>Optional</small>}</div>)}</div></main><aside className="progress-panel roadmap-detail-aside"><span className="eyebrow">About this roadmap</span><p>{roadmap.note}</p><strong>Core topics</strong><ul>{roadmap.coreTopics.map((topic) => <li key={topic}>{topic}</li>)}</ul><strong>Optional topics</strong><ul>{roadmap.optionalTopics.map((topic) => <li key={topic}>{topic}</li>)}</ul></aside></div></div>
}
