from app.core.schemas import CamelModel


class CatalogConceptOut(CamelModel):
    name: str
    description: str


class CatalogCourseOut(CamelModel):
    id: str
    slug: str
    title: str
    subject: str
    level: str
    domains: list[str]
    hours: int
    description: str
    concept_count: int
    concepts: list[CatalogConceptOut]
    enrolled_course_id: str | None  # the student's own copy, when enrolled
