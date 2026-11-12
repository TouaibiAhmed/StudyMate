from typing import Annotated

from fastapi import APIRouter, File, Response, UploadFile, status

from app.modules.auth.deps import DB, CurrentUser
from app.modules.documents import service
from app.modules.documents.schemas import DocumentOut, DocumentStatusOut

router = APIRouter(prefix="/api", tags=["documents"])


@router.get("/courses/{course_id}/documents")
async def list_documents(course_id: str, user: CurrentUser, db: DB) -> list[DocumentOut]:
    return await service.list_documents(db, user.id, course_id)


@router.post("/courses/{course_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    course_id: str, user: CurrentUser, db: DB, file: Annotated[UploadFile, File()]
) -> DocumentOut:
    return await service.upload_document(db, user.id, course_id, file)


@router.get("/documents/{document_id}/status")
async def document_status(document_id: str, user: CurrentUser, db: DB) -> DocumentStatusOut:
    return await service.get_status(db, user.id, document_id)


@router.post("/documents/{document_id}/retry")
async def retry_document(document_id: str, user: CurrentUser, db: DB) -> DocumentOut:
    return await service.retry_document(db, user.id, document_id)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, user: CurrentUser, db: DB) -> Response:
    await service.delete_document(db, user.id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
