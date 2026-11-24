from datetime import date, datetime
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, File, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from . import crud, schemas
from .database import Base, engine, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sport Tracker")

BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


# ==================== HTML ====================
@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/import", response_class=HTMLResponse)
def import_page(request: Request):
    return templates.TemplateResponse(request, "import.html")


# ==================== Days ====================
@app.get("/api/days")
def api_list_days(db: Session = Depends(get_db)):
    return [d.model_dump(mode="json") for d in crud.list_days(db)]


@app.get("/api/day/{day}")
def api_get_day(day: date, db: Session = Depends(get_db)):
    return crud.get_day(db, day).model_dump(mode="json")


@app.post("/api/day/{day}")
def api_upsert_day(day: date, payload: schemas.DayUpsert, db: Session = Depends(get_db)):
    return crud.upsert_day(db, day, payload).model_dump(mode="json")


@app.delete("/api/day/{day}")
def api_delete_day(day: date, db: Session = Depends(get_db)):
    crud.delete_day(db, day)
    return {"ok": True}


# ==================== Charts ====================
@app.get("/api/chart/workouts")
def chart_workouts(db: Session = Depends(get_db)):
    result = []
    for d in crud.list_days(db):
        if not d.workout or not d.workout.exercises:
            continue
        total = sum(sum(ex.reps_list) for ex in d.workout.exercises)
        result.append(
            {
                "date": d.date.isoformat(),
                "total_reps": total,
                "exercises": [
                    {
                        "name": ex.exercise_name,
                        "reps_list": ex.reps_list,
                        "total": sum(ex.reps_list),
                    }
                    for ex in d.workout.exercises
                ],
                "notes": d.workout.notes,
            }
        )
    result.sort(key=lambda x: x["date"])
    return result


@app.get("/api/chart/protein")
def chart_protein(db: Session = Depends(get_db)):
    result = []
    for d in crud.list_days(db):
        if not d.meals:
            continue
        result.append(
            {
                "date": d.date.isoformat(),
                "total_protein": d.total_protein,
                "meals": [
                    {
                        "description": m.description,
                        "protein_g": m.protein_g,
                        "calories": m.calories,
                    }
                    for m in d.meals
                ],
            }
        )
    result.sort(key=lambda x: x["date"])
    return result


@app.get("/api/chart/weight")
def chart_weight(db: Session = Depends(get_db)):
    result = [
        {"date": d.date.isoformat(), "weight_kg": d.body.weight_kg}
        for d in crud.list_days(db)
        if d.body and d.body.weight_kg is not None
    ]
    result.sort(key=lambda x: x["date"])
    return result


# ==================== Export (гибкий) ====================
@app.get("/api/export")
def export_data(
    workouts: bool = False,
    food: bool = False,
    body: bool = False,
    db: Session = Depends(get_db),
):
    """
    Экспорт выбранных категорий данных. Формат совместим с /api/import/json.
    Внутри каждой записи дня — только те блоки, которые включены флагами.
    """
    days = sorted(crud.list_days(db), key=lambda x: x.date)

    days_out = []
    total_workouts = 0
    total_reps = 0
    total_protein_sum = 0.0

    for d in days:
        entry = {"date": d.date.isoformat()}
        has_data = False

        # --- Тренировка ---
        if workouts and d.workout and d.workout.exercises:
            day_total = sum(sum(ex.reps_list) for ex in d.workout.exercises)
            total_workouts += 1
            total_reps += day_total
            entry["is_workout_day"] = True
            entry["workout_notes"] = d.workout.notes
            entry["exercises"] = [
                {
                    "exercise_name": ex.exercise_name,
                    "reps_list": ex.reps_list,
                }
                for ex in d.workout.exercises
            ]
            entry["total_reps"] = day_total
            has_data = True

        # --- Питание ---
        if food and d.meals:
            total_protein_sum += d.total_protein
            entry["meals"] = [
                {
                    "date": d.date.isoformat(),
                    "description": m.description,
                    "protein_g": m.protein_g,
                    "calories": m.calories,
                }
                for m in d.meals
            ]
            entry["total_protein"] = d.total_protein
            has_data = True

        # --- Тело ---
        if body and d.body and (
            d.body.weight_kg is not None
            or d.body.height_cm is not None
            or d.body.notes
        ):
            entry["body"] = {
                "date": d.date.isoformat(),
                "weight_kg": d.body.weight_kg,
                "height_cm": d.body.height_cm,
                "notes": d.body.notes,
            }
            has_data = True

        if has_data:
            days_out.append(entry)

    result = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "include": {"workouts": workouts, "food": food, "body": body},
        "total_days": len(days_out),
    }
    if workouts:
        result["total_workouts"] = total_workouts
        result["total_reps"] = total_reps
    if food:
        result["total_protein_g"] = round(total_protein_sum, 1)

    result["days"] = days_out
    return result


# ==================== Import ====================
@app.post("/api/import/json")
def import_json(payload: schemas.ImportPayload, db: Session = Depends(get_db)):
    return {"ok": True, **crud.import_days(db, payload)}


# ==================== Шаблоны ====================
@app.get("/api/templates/exercises", response_model=List[schemas.ExerciseTemplateOut])
def api_list_ex_templates(db: Session = Depends(get_db)):
    return crud.list_exercise_templates(db)


@app.post("/api/templates/exercises", response_model=schemas.ExerciseTemplateOut)
def api_upsert_ex_template(
    payload: schemas.ExerciseTemplateCreate, db: Session = Depends(get_db)
):
    return crud.upsert_exercise_template(db, payload)


@app.delete("/api/templates/exercises/{tpl_id}")
def api_delete_ex_template(tpl_id: int, db: Session = Depends(get_db)):
    if not crud.delete_exercise_template(db, tpl_id):
        return {"ok": False, "error": "not found"}
    return {"ok": True}


@app.get("/api/templates/meals", response_model=List[schemas.MealTemplateOut])
def api_list_meal_templates(db: Session = Depends(get_db)):
    return crud.list_meal_templates(db)


@app.post("/api/templates/meals", response_model=schemas.MealTemplateOut)
def api_upsert_meal_template(
    payload: schemas.MealTemplateCreate, db: Session = Depends(get_db)
):
    return crud.upsert_meal_template(db, payload)


@app.delete("/api/templates/meals/{tpl_id}")
def api_delete_meal_template(tpl_id: int, db: Session = Depends(get_db)):
    if not crud.delete_meal_template(db, tpl_id):
        return {"ok": False, "error": "not found"}
    return {"ok": True}


# ==================== Заглушка фото еды ====================
@app.post("/api/food/analyze-photo", response_model=schemas.FoodPhotoAnalysisResult)
async def analyze_food_photo(file: UploadFile = File(...)):
    _ = await file.read()
    return schemas.FoodPhotoAnalysisResult(
        message="Анализ фото пока не подключён. Заглушка работает: файл получен.",
        confidence=0.0,
    )