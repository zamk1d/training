from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


# ==================== Exercise ====================
class ExerciseCreate(BaseModel):
    exercise_name: str = Field(..., min_length=1, max_length=120)
    reps_list: Optional[List[int]] = None
    sets: Optional[int] = None
    reps: Optional[int] = None

    @model_validator(mode="after")
    def _ensure_reps(self):
        if self.reps_list is None:
            if self.sets is not None and self.reps is not None:
                self.reps_list = [self.reps] * self.sets
            else:
                raise ValueError("Нужно передать reps_list или (sets и reps) вместе")
        if not self.reps_list:
            raise ValueError("reps_list не может быть пустым")
        if any((not isinstance(r, int)) or r < 1 or r > 1000 for r in self.reps_list):
            raise ValueError("Каждое значение в reps_list должно быть целым от 1 до 1000")
        return self


class ExerciseOut(BaseModel):
    id: int
    exercise_name: str
    reps_list: List[int]

    model_config = {"from_attributes": True}


# ==================== Workout ====================
class WorkoutCreate(BaseModel):
    date: date
    notes: Optional[str] = Field(None, max_length=2000)
    exercises: List[ExerciseCreate] = Field(default_factory=list)


class WorkoutOut(BaseModel):
    id: int
    date: date
    notes: Optional[str]
    exercises: List[ExerciseOut]

    model_config = {"from_attributes": True}


# ==================== Meal ====================
class MealCreate(BaseModel):
    date: date
    description: Optional[str] = Field(None, max_length=500)
    protein_g: Optional[float] = Field(None, ge=0, le=500)
    calories: Optional[float] = Field(None, ge=0, le=10000)


class MealOut(MealCreate):
    id: int

    model_config = {"from_attributes": True}


# ==================== Body ====================
class BodyCreate(BaseModel):
    date: date
    weight_kg: Optional[float] = Field(None, ge=20, le=300)
    height_cm: Optional[float] = Field(None, ge=50, le=250)
    notes: Optional[str] = Field(None, max_length=500)


class BodyOut(BodyCreate):
    id: int

    model_config = {"from_attributes": True}


# ==================== Day (агрегированный) ====================
class DayOut(BaseModel):
    date: date
    workout: Optional[WorkoutOut] = None
    meals: List[MealOut] = Field(default_factory=list)
    body: Optional[BodyOut] = None
    total_protein: float = 0.0


class DayUpsert(BaseModel):
    workout: Optional[WorkoutCreate] = None
    meals: List[MealCreate] = Field(default_factory=list)
    body: Optional[BodyCreate] = None


# ==================== Импорт JSON ====================
class DayImport(BaseModel):
    date: date
    is_workout_day: bool = False
    workout_notes: Optional[str] = None
    exercises: List[ExerciseCreate] = Field(default_factory=list)
    meals: List[MealCreate] = Field(default_factory=list)
    body: Optional[BodyCreate] = None


class ImportPayload(BaseModel):
    days: List[DayImport]


# ==================== Заглушка анализа фото ====================
class FoodPhotoAnalysisResult(BaseModel):
    protein_g: Optional[float] = None
    calories: Optional[float] = None
    description: Optional[str] = None
    confidence: Optional[float] = None
    message: str = "Анализ фото пока не подключён."


# ==================== Шаблоны ====================
class ExerciseTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    default_reps_list: List[int] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _check_reps(self):
        if any((not isinstance(r, int)) or r < 1 or r > 1000 for r in self.default_reps_list):
            raise ValueError("Каждое значение в default_reps_list должно быть целым от 1 до 1000")
        return self


class ExerciseTemplateOut(ExerciseTemplateCreate):
    id: int
    model_config = {"from_attributes": True}


class MealTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    default_protein_g: Optional[float] = Field(None, ge=0, le=500)
    default_calories: Optional[float] = Field(None, ge=0, le=10000)


class MealTemplateOut(MealTemplateCreate):
    id: int
    model_config = {"from_attributes": True}