from datetime import date
from typing import List, Optional

from sqlalchemy.orm import Session

from . import models, schemas


# ==================== helpers ====================
def _get_workout(db: Session, day: date) -> Optional[models.WorkoutSession]:
    return (
        db.query(models.WorkoutSession)
        .filter(models.WorkoutSession.date == day)
        .first()
    )


def _get_body(db: Session, day: date) -> Optional[models.BodyMeasurement]:
    return (
        db.query(models.BodyMeasurement)
        .filter(models.BodyMeasurement.date == day)
        .first()
    )


def _get_meals(db: Session, day: date) -> List[models.Meal]:
    return (
        db.query(models.Meal)
        .filter(models.Meal.date == day)
        .order_by(models.Meal.id)
        .all()
    )


# ==================== read ====================
def get_day(db: Session, day: date) -> schemas.DayOut:
    workout = _get_workout(db, day)
    body = _get_body(db, day)
    meals = _get_meals(db, day)
    total_protein = sum(m.protein_g for m in meals if m.protein_g is not None)

    return schemas.DayOut(
        date=day,
        workout=schemas.WorkoutOut.model_validate(workout) if workout else None,
        meals=[schemas.MealOut.model_validate(m) for m in meals],
        body=schemas.BodyOut.model_validate(body) if body else None,
        total_protein=round(total_protein, 1),
    )


def list_days(db: Session) -> List[schemas.DayOut]:
    dates: set[date] = set()
    for (d,) in db.query(models.WorkoutSession.date).all():
        dates.add(d)
    for (d,) in db.query(models.Meal.date).all():
        dates.add(d)
    for (d,) in db.query(models.BodyMeasurement.date).all():
        dates.add(d)
    return [get_day(db, d) for d in sorted(dates, reverse=True)]


# ==================== write ====================
def delete_day(db: Session, day: date) -> None:
    w = _get_workout(db, day)
    if w:
        db.delete(w)
    db.query(models.Meal).filter(models.Meal.date == day).delete()
    b = _get_body(db, day)
    if b:
        db.delete(b)
    db.commit()


def upsert_day(db: Session, day: date, payload: schemas.DayUpsert) -> schemas.DayOut:
    delete_day(db, day)

    if payload.workout and payload.workout.exercises:
        ws = models.WorkoutSession(date=day, notes=payload.workout.notes)
        for ex in payload.workout.exercises:
            ws.exercises.append(
                models.ExerciseEntry(
                    exercise_name=ex.exercise_name.strip(),
                    reps_list=[int(r) for r in ex.reps_list],
                )
            )
        db.add(ws)

    for m in payload.meals:
        if m.description or m.protein_g is not None or m.calories is not None:
            db.add(
                models.Meal(
                    date=day,
                    description=m.description,
                    protein_g=m.protein_g,
                    calories=m.calories,
                )
            )

    if payload.body and (
        payload.body.weight_kg is not None
        or payload.body.height_cm is not None
        or payload.body.notes
    ):
        db.add(
            models.BodyMeasurement(
                date=day,
                weight_kg=payload.body.weight_kg,
                height_cm=payload.body.height_cm,
                notes=payload.body.notes,
            )
        )

    db.commit()
    return get_day(db, day)


def import_days(db: Session, payload: schemas.ImportPayload) -> dict:
    created = 0
    skipped: List[str] = []

    for d in payload.days:
        has_workout = bool(d.exercises)
        has_meals = any(
            m.description or m.protein_g is not None or m.calories is not None
            for m in d.meals
        )
        has_body = bool(
            d.body
            and (
                d.body.weight_kg is not None
                or d.body.height_cm is not None
                or d.body.notes
            )
        )

        if not (has_workout or has_meals or has_body):
            skipped.append(f"{d.date}: нет данных")
            continue

        existing = get_day(db, d.date)
        if existing.workout or existing.meals or existing.body:
            skipped.append(f"{d.date}: день уже существует, пропущен")
            continue

        upsert_day(
            db,
            d.date,
            schemas.DayUpsert(
                workout=(
                    schemas.WorkoutCreate(
                        date=d.date,
                        notes=d.workout_notes,
                        exercises=d.exercises,
                    )
                    if has_workout
                    else None
                ),
                meals=d.meals,
                body=d.body,
            ),
        )
        created += 1

    return {"created": created, "skipped": skipped}


# ==================== Шаблоны ====================
def list_exercise_templates(db: Session) -> List[models.ExerciseTemplate]:
    return (
        db.query(models.ExerciseTemplate)
        .order_by(models.ExerciseTemplate.name)
        .all()
    )


def upsert_exercise_template(
    db: Session, payload: schemas.ExerciseTemplateCreate
) -> models.ExerciseTemplate:
    existing = (
        db.query(models.ExerciseTemplate)
        .filter(models.ExerciseTemplate.name == payload.name)
        .first()
    )
    if existing:
        existing.default_reps_list = [int(r) for r in payload.default_reps_list]
        db.commit()
        db.refresh(existing)
        return existing
    t = models.ExerciseTemplate(
        name=payload.name,
        default_reps_list=[int(r) for r in payload.default_reps_list],
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def delete_exercise_template(db: Session, tpl_id: int) -> bool:
    t = db.get(models.ExerciseTemplate, tpl_id)
    if not t:
        return False
    db.delete(t)
    db.commit()
    return True


def list_meal_templates(db: Session) -> List[models.MealTemplate]:
    return db.query(models.MealTemplate).order_by(models.MealTemplate.name).all()


def upsert_meal_template(
    db: Session, payload: schemas.MealTemplateCreate
) -> models.MealTemplate:
    existing = (
        db.query(models.MealTemplate)
        .filter(models.MealTemplate.name == payload.name)
        .first()
    )
    if existing:
        existing.default_protein_g = payload.default_protein_g
        existing.default_calories = payload.default_calories
        db.commit()
        db.refresh(existing)
        return existing
    t = models.MealTemplate(
        name=payload.name,
        default_protein_g=payload.default_protein_g,
        default_calories=payload.default_calories,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def delete_meal_template(db: Session, tpl_id: int) -> bool:
    t = db.get(models.MealTemplate, tpl_id)
    if not t:
        return False
    db.delete(t)
    db.commit()
    return True