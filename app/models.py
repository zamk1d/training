from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    exercises: Mapped[List["ExerciseEntry"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ExerciseEntry.id",
    )


class ExerciseEntry(Base):
    __tablename__ = "exercise_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_sessions.id"))
    exercise_name: Mapped[str] = mapped_column(String(120), index=True)
    reps_list: Mapped[List[int]] = mapped_column(JSON)

    session: Mapped["WorkoutSession"] = relationship(back_populates="exercises")


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    protein_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calories: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BodyMeasurement(Base):
    __tablename__ = "body_measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    height_cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


# ==================== Шаблоны ====================
class ExerciseTemplate(Base):
    __tablename__ = "exercise_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    default_reps_list: Mapped[List[int]] = mapped_column(JSON)


class MealTemplate(Base):
    __tablename__ = "meal_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    default_protein_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    default_calories: Mapped[Optional[float]] = mapped_column(Float, nullable=True)