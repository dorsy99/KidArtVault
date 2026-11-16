from pydantic import BaseModel, Field


class SetupRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class Verify2FARequest(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class Enable2FARequest(BaseModel):
    secret: str
    code: str = Field(min_length=6, max_length=10)


class Disable2FARequest(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=10)


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="member", pattern=r"^(admin|member|viewer)$")


class UserUpdate(BaseModel):
    role: str | None = Field(default=None, pattern=r"^(admin|member|viewer)$")
    password: str | None = Field(default=None, min_length=8, max_length=128)


class KidCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    birthdate: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    color: str = Field(default="#e07a5f", pattern=r"^#[0-9a-fA-F]{6}$")


class KidUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    birthdate: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class ArtworkUpdate(BaseModel):
    kid_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=150)
    notes: str | None = Field(default=None, max_length=4000)
    location: str | None = Field(default=None, max_length=80)
    tags: list[str] | None = None
    artwork_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    is_favorite: bool | None = None


class ShareCreate(BaseModel):
    label: str = Field(default="", max_length=100)
    kid_id: int | None = None
    artwork_id: str | None = None
    expires_days: int | None = Field(default=None, ge=1, le=3650)
