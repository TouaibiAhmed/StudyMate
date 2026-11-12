from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.modules.auth.models import User
from app.modules.profile.domains import classify_domain
from app.modules.profile.models import StudentProfile
from app.modules.profile.schemas import PreferencesIn, PreferencesOut, ProfileFields, ProfileOut, UserOut

_CLASSIFY_INPUTS = {"field_of_study", "domain", "specialization"}


def apply_profile_fields(profile: StudentProfile, fields: ProfileFields, *, partial: bool) -> None:
    # Python names (not camelCase aliases), and only profile fields: RegisterIn also carries
    # email/password/name, which must never be copied onto the profile.
    data = fields.model_dump(exclude_unset=partial, by_alias=False, include=set(ProfileFields.model_fields))
    explicit_domain_type = data.pop("domain_type", None)
    for key, value in data.items():
        if value is None and key in ("field_of_study", "level", "preferred_language", "time_zone", "show_streaks"):
            continue  # required columns: ignore explicit nulls
        if isinstance(value, str):
            value = value.strip()
            if key in ("domain", "specialization", "target_role") and not value:
                value = None  # optional text fields: empty means "not set"
        setattr(profile, key, value)
    if not profile.field_of_study:
        profile.field_of_study = profile.specialization or profile.domain or ""
    if explicit_domain_type:
        profile.domain_type = explicit_domain_type
    elif not partial or _CLASSIFY_INPUTS & data.keys():
        profile.domain_type = classify_domain(profile.specialization, profile.domain, profile.field_of_study)


def to_profile_out(profile: StudentProfile, user: User) -> ProfileOut:
    out = ProfileOut.model_validate(profile)
    u = UserOut.model_validate(user)
    return out.model_copy(update={"user": u, "email": u.email, "display_name": u.display_name})


async def get_profile(db: AsyncSession, user: User) -> StudentProfile:
    profile = await db.get(StudentProfile, user.id)
    if profile is None:
        raise NotFoundError("Profile not found.")
    return profile


async def update_profile(db: AsyncSession, user: User, fields: ProfileFields) -> ProfileOut:
    profile = await get_profile(db, user)
    apply_profile_fields(profile, fields, partial=True)
    await db.commit()
    await db.refresh(profile)
    return to_profile_out(profile, user)


def to_preferences_out(profile: StudentProfile) -> PreferencesOut:
    return PreferencesOut(
        hide_streaks=not profile.show_streaks,
        session_length=f"{profile.session_length_minutes} minutes",  # type: ignore[arg-type]
        weekly_goal=profile.weekly_goal,
        reminder_time=profile.reminder_time,
    )


async def update_preferences(db: AsyncSession, user: User, prefs: PreferencesIn) -> PreferencesOut:
    profile = await get_profile(db, user)
    profile.show_streaks = not prefs.hide_streaks
    profile.session_length_minutes = int(prefs.session_length.split()[0])
    profile.weekly_goal = prefs.weekly_goal
    profile.reminder_time = prefs.reminder_time
    await db.commit()
    return to_preferences_out(profile)
