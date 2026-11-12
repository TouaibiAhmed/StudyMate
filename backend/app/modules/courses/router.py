from fastapi import APIRouter, Response, status

from app.ai.embeddings import get_embedder
from app.core.config import get_settings
from app.modules.auth.deps import DB, CurrentUser
from app.modules.courses import service
from app.modules.courses.schemas import ConceptOut, CourseCreate, CourseOut, SearchHit, SearchIn, SearchOut
from app.rag.interfaces import RetrievalParams, RetrievalScope
from app.rag.retriever import PgVectorRetriever

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("")
async def list_courses(user: CurrentUser, db: DB) -> list[CourseOut]:
    return await service.list_courses(db, user.id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_course(data: CourseCreate, user: CurrentUser, db: DB) -> CourseOut:
    return await service.create_course(db, user.id, data)


@router.get("/{course_id}")
async def get_course(course_id: str, user: CurrentUser, db: DB) -> CourseOut:
    return await service.get_course(db, user.id, course_id)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(course_id: str, user: CurrentUser, db: DB) -> Response:
    await service.delete_course(db, user.id, course_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{course_id}/concepts")
async def list_concepts(course_id: str, user: CurrentUser, db: DB) -> list[ConceptOut]:
    return await service.list_concepts(db, user.id, course_id)


@router.post("/{course_id}/concepts/extract", status_code=status.HTTP_202_ACCEPTED)
async def extract_concepts(course_id: str, user: CurrentUser, db: DB) -> CourseOut:
    """Identify concepts again from all ready documents (the extraction runs in the worker)."""
    return await service.extract_concepts_again(db, user.id, course_id)


@router.post("/{course_id}/search")
async def search(course_id: str, data: SearchIn, user: CurrentUser, db: DB) -> SearchOut:
    """Retrieval over the course's indexed material (used by chat/tutor; handy for checking RAG)."""
    await service.get_owned_course(db, user.id, course_id)
    settings = get_settings()
    evidence = await PgVectorRetriever(db, get_embedder()).retrieve(
        data.query,
        RetrievalScope(user_id=user.id, course_id=course_id, document_ids=data.document_ids),
        RetrievalParams(top_k=data.top_k, candidate_k=settings.retrieval_candidate_k,
                        min_score=settings.retrieval_min_score),
    )
    return SearchOut(
        knowledge_mode=evidence.mode.value,
        items=[SearchHit(label=e.label, chunk_id=e.chunk_id, document_id=e.document_id, title=e.document_title,
                         page_start=e.page_start, page_end=e.page_end, score=e.score, text=e.text)
               for e in evidence.items],
    )
