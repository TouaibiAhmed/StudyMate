from fastapi import APIRouter

from app.modules.auth.deps import DB, CurrentUser
from app.modules.profile import service
from app.modules.profile.schemas import PreferencesIn, PreferencesOut, ProfileFields, ProfileOut

router = APIRouter(prefix="/api", tags=["profile"])


@router.get("/profile")
async def get_profile(user: CurrentUser, db: DB) -> ProfileOut:
    return service.to_profile_out(await service.get_profile(db, user), user)


@router.patch("/profile")
async def patch_profile(data: ProfileFields, user: CurrentUser, db: DB) -> ProfileOut:
    return await service.update_profile(db, user, data)


@router.get("/preferences")
async def get_preferences(user: CurrentUser, db: DB) -> PreferencesOut:
    return service.to_preferences_out(await service.get_profile(db, user))


@router.put("/preferences")
async def put_preferences(data: PreferencesIn, user: CurrentUser, db: DB) -> PreferencesOut:
    return await service.update_preferences(db, user, data)
