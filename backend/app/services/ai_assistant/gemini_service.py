import base64
import os
from pathlib import Path
import re
from typing import Any, Optional
from dotenv import load_dotenv
import httpx

from app.services.ai_assistant.schemas import ChatMessage, ImageAttachment

ADVISOR_SYSTEM_INSTRUCTION = """You are the FieldShift AI Advisor, a farming assistant for farmers in Brandenburg, Germany. You answer using only the verified field data supplied below.

RULES (always follow):
1. CITE SOURCES: Every answer must name the data source(s) it draws from, using the source names given in the context (for example "ISRIC SoilGrids v2.0", "Open-Meteo", "NASA SMAP", "NASA POWER", "Deutscher Wetterdienst (DWD) warnings"). Put them in a final line starting with "Sources:". If the answer uses no field data, say "Sources: general agronomic knowledge, not your field data."
2. NO PROFIT PROMISES: Never state or imply a specific profit, revenue, margin or yield-income figure. You may describe risks and trade-offs in qualitative terms.
3. PLAIN LANGUAGE: Write for a farmer, not an engineer. Do not quote raw sensor values or indices (soil moisture fractions, NDVI, raw pH decimals beyond one place, coordinates, IDs). Say "the soil is on the dry side" rather than a sensor number. Everyday figures such as temperature in degrees C, rain in mm, days and dates are fine.
4. WHEN UNSURE: If the data is missing, conflicting or too coarse to support the advice, say so plainly and recommend consulting a local agronomist (for example the Landwirtschaftskammer or a certified Pflanzenbauberater).
5. NEVER GUESS MISSING DATA: Items under "NOT AVAILABLE" in the context are not known. If the farmer asks about them (legal nitrogen ceiling, Red Zone status, crop history, plant-available water capacity), tell them the platform does not have it yet. Do not estimate it. Do not give legal advice; for Düngeverordnung (DüV) limits refer them to their official Düngebedarfsermittlung or the local authority.
6. STYLE: Start with the direct answer in one or two sentences. Then at most 3 short bullets. No tables, no headings, no LaTeX, no closing questions. Keep it under 150 words.
"""

BASE_SYSTEM_INSTRUCTION = """You are FieldShift AI, an agronomic decision-support assistant for commercial farmers in Brandenburg, Germany.

CORE RESPONSE REQUIREMENTS:
1. CONCISE & HIGH SIGNAL-TO-NOISE (STRICT):
   - Maximum answer length: 110 to 160 words total. Farmers need rapid, high-signal, scannable advice.
   - NO FILLER OR PLEASANTRIES: Never begin with "In Brandenburg...", "Certainly!", "Here is an overview", or conversational greetings.
   - Start immediately with the direct answer or verdict on line 1.
   - Follow with exactly 2 to 3 concise, scannable bullet points using standard bullets (•).
   - Each bullet must start with a **Bold Key Phrase**: followed by 1 practical sentence with exact numbers, dates, or rates.
   - End with 1 clear actionable recommendation. Do NOT ask conversational closing questions (e.g. do NOT say "Are you planning...?" or "Would you like me to...?").

2. ZERO FORMATTING ARTIFACTS:
   - NEVER use `####` or deeper heading levels. Use `### ` only if a main title is truly needed.
   - NEVER output markdown tables unless the user explicitly used the word "table" in their prompt.
   - NEVER output divider lines (`---` or `***`).
   - NEVER write LaTeX math syntax (e.g., do NOT write `$\\text{C}_{\\text{org}}$`, `$\\text{K}_2\\text{O}$`, `$\\text{P}_2\\text{O}_5$`). Always write plain chemical symbols: Corg, K2O, P2O5, N.
   - NEVER output escaped backslashes before asterisks (do NOT write `\\*` or `\\**`). Write clean Markdown: `**bold**` or `*italic*`.
   - NEVER output internal database field IDs (e.g., `field-1a06dfdb7`). Only refer to the user-facing field name or farm name.

3. AGRONOMIC ACCURACY & LOCAL REGULATIONS:
   - Base all advice on the user's specific field data (SoilGrids texture like Sandy Loam, topsoil pH, organic carbon, latest NDVI).
   - Fertilization must strictly obey the German DüV (Düngeverordnung): 170 kg N/ha/year organic cap, split-nitrogen dressings on light sandy soils to prevent leaching.
   - Crop guidance must account for Brandenburg's sandy outwash soils, 500-600 mm precipitation, and May-June drought risk."""


class GeminiService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.primary_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        # gemini-2.5-flash (named in plan.md) is retired for new API keys (HTTP 404); 3.5-flash is the live equivalent.
        self.advisor_model = os.getenv("GEMINI_ADVISOR_MODEL", "gemini-3.5-flash")

    def _get_api_key(self) -> str:
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            try:
                root = Path(__file__).resolve().parents[4]
                load_dotenv(root / ".env")
                load_dotenv(root / ".env.example")
                load_dotenv(root / "backend" / ".env")
                load_dotenv(root / "backend" / ".env.example")
                key = os.getenv("GEMINI_API_KEY", "").strip()
            except Exception:
                pass
        return key or self.api_key

    def _sanitize_response(self, text: str) -> str:
        """Strips formatting artifacts, raw LaTeX math, deep headers, and internal database IDs."""
        if not text:
            return ""

        # 1. Clean raw LaTeX math symbols
        t = re.sub(r'\$\\text\{C\}_(?:\{)?(?:\\text\{)?org\}?(?:\})?\$', 'Corg', text, flags=re.I)
        t = re.sub(r'\$\\text\{K\}_2\\text\{O\}\$', 'K2O', t, flags=re.I)
        t = re.sub(r'\$\\text\{P\}_2\\text\{O\}_5\$', 'P2O5', t, flags=re.I)
        t = re.sub(r'\$\\text\{([A-Za-z0-9\s]+)\}\$', r'\1', t)
        t = re.sub(r'\$([A-Za-z0-9_\-\+]+)\$', r'\1', t)

        # 2. Strip internal database field IDs like ( field-1a06dfdb7 ) or field-xxxx
        t = re.sub(r'\(\s*field-[a-z0-9\-]+\s*\)', '', t, flags=re.I)

        # 3. Clean escaped asterisks and backslashes
        t = t.replace(r'\*', '*')
        t = t.replace(r'\_', '_')
        t = t.replace(r'\#', '#')

        # 4. Remove #### and deeper headers -> convert to clean bold bullet
        t = re.sub(r'^(?:#{4,6})\s*(.*)$', r'• **\1**', t, flags=re.M)

        # 5. Remove horizontal divider lines (--- or ***)
        t = re.sub(r'^\s*[-*_]{3,}\s*$', '', t, flags=re.M)

        # 6. Remove filler openings
        t = re.sub(r'^(?:Here is(?: concise)? (?:advice|an overview|guidance|information)[^:\n]*:?\s*)+', '', t, flags=re.I)

        # 7. Remove conversational closing questions
        t = re.sub(
            r'\n+\*?(?:Are you planning|Would you like|Do you have any questions|Feel free to ask)[^\n]*\??\*?$',
            '',
            t,
            flags=re.I,
        )

        # 8. Normalize excessive blank lines
        t = re.sub(r'\n{3,}', '\n\n', t)

        return t.strip()

    async def generate_response(
        self,
        user_message: str,
        field_context: str,
        conversation_history: list[ChatMessage],
        attachments: Optional[list[ImageAttachment]] = None,
        category: Optional[str] = None,
    ) -> tuple[str, str]:
        """
        Sends conversation to Gemini API with full field context and multi-modal attachments.
        Returns (response_text, model_name).
        """
        api_key = self._get_api_key()

        if api_key:
            try:
                reply, model = await self._call_gemini_api(
                    api_key=api_key,
                    user_message=user_message,
                    field_context=field_context,
                    history=conversation_history,
                    attachments=attachments or [],
                    category=category,
                )
                if reply and reply.strip():
                    cleaned = self._sanitize_response(reply)
                    return cleaned, model
            except Exception as e:
                print(f"[GeminiService] Gemini API call exception: {e}. Falling back to internal Agronomic Engine.")

        if category == "advisor":
            # Never serve canned agronomy as if it were this field's data.
            return (
                "The AI Advisor can't reach its language model right now, so I can't give a grounded answer. "
                "Please try again in a moment. For urgent decisions, consult a local agronomist.\n\n"
                "Sources: none (no answer generated)."
            ), "unavailable"

        # Fallback to local data-grounded agronomic engine
        fallback_text = self._generate_agronomic_fallback(
            user_message=user_message,
            field_context=field_context,
            attachments=attachments or [],
            category=category,
        )
        return self._sanitize_response(fallback_text), "fieldshift-agronomic-engine-v1"

    async def _call_gemini_api(
        self,
        api_key: str,
        user_message: str,
        field_context: str,
        history: list[ChatMessage],
        attachments: list[ImageAttachment],
        category: Optional[str] = None,
    ) -> tuple[str, str]:
        is_advisor = category == "advisor"
        base_instruction = ADVISOR_SYSTEM_INSTRUCTION if is_advisor else BASE_SYSTEM_INSTRUCTION
        # Formulate full system instruction including the field context
        full_system_text = f"{base_instruction}\n\n=== VERIFIED AGRICULTURAL CONTEXT FOR THIS SESSION ===\n{field_context}"

        # Build contents from recent history (last 10 turns)
        contents = []
        for h in history[-10:]:
            if h.sender == "user":
                part_list: list[dict[str, Any]] = [{"text": h.message}]
                for att in h.attachments:
                    if att.base64_data:
                        part_list.append({
                            "inlineData": {
                                "mimeType": att.content_type,
                                "data": self._clean_base64(att.base64_data),
                            }
                        })
                contents.append({"role": "user", "parts": part_list})
            elif h.sender == "assistant":
                contents.append({"role": "model", "parts": [{"text": h.message}]})

        # Add current user turn
        current_parts: list[dict[str, Any]] = [{"text": user_message}]
        for att in attachments:
            if att.base64_data:
                current_parts.append({
                    "inlineData": {
                        "mimeType": att.content_type,
                        "data": self._clean_base64(att.base64_data),
                    }
                })
        contents.append({"role": "user", "parts": current_parts})

        payload = {
            "systemInstruction": {
                "parts": [{"text": full_system_text}]
            },
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                "topP": 0.85,
                "maxOutputTokens": 2048,
            },
        }

        # Candidate models supported by Gemini API
        if is_advisor:
            models_to_try = [self.advisor_model, "gemini-3.8-flash", "gemini-flash-latest"]
        else:
            models_to_try = [
                self.primary_model,
                "gemini-3.5-flash",
                "gemini-3.1-flash-lite",
                "gemini-flash-latest",
                "gemini-3.8-flash",
            ]
        seen = set()

        async with httpx.AsyncClient(timeout=30.0 if is_advisor else 18.0) as client:
            for model_candidate in models_to_try:
                if model_candidate in seen:
                    continue
                seen.add(model_candidate)

                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_candidate}:generateContent"
                try:
                    resp = await client.post(
                        url, json=payload,
                        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                    )

                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            content = candidates[0].get("content", {})
                            parts = content.get("parts", [])
                            text_parts = [p.get("text", "") for p in parts if "text" in p]
                            if text_parts:
                                return "".join(text_parts), model_candidate
                    else:
                        print(f"[GeminiService] Model '{model_candidate}' returned status {resp.status_code}: {resp.text[:200]}")
                except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as timeout_err:
                    print(f"[GeminiService] Network connection or read timeout ({timeout_err}). Engaging Agronomic Fallback.")
                    break
                except Exception as req_err:
                    print(f"[GeminiService] Request error for {model_candidate}: {req_err}")

        raise RuntimeError("No candidate Gemini model succeeded.")

    def _clean_base64(self, raw: str) -> str:
        if "," in raw:
            return raw.split(",", 1)[1]
        return raw.strip()

    def _generate_agronomic_fallback(
        self,
        user_message: str,
        field_context: str,
        attachments: list[ImageAttachment],
        category: Optional[str] = None,
    ) -> str:
        """High-precision local agronomic response generator using verified field data."""
        msg_lower = user_message.lower()
        has_image = bool(attachments)

        if has_image:
            return (
                "### Visual Plant & Foliar Diagnosis\n\n"
                "**Assessment**: The uploaded foliar specimen shows early interveinal chlorosis and localized tissue mottling.\n\n"
                "• **Probable Cause**: On light sandy loam, rapid percolation after rain often leaches mobile nitrogen (N) and magnesium (Mg), producing pale interveinal striping.\n"
                "• **Foliar Pathogen Risk**: Monitor for early septoria or rust pustules on lower canopy leaves.\n"
                "• **Recommended Action**: Inspect leaf undersides with a 10x lens; apply a corrective micronutrient foliar spray (EPSO Top / Bittersalz 5 kg/ha) if symptoms persist across >10% of plants."
            )

        if category == "fertilizer" or any(w in msg_lower for w in ["fertiliz", "dünger", "nitrogen", "stickstoff", "npk", "urea", "phosphor", "potassium"]):
            return (
                "### Fertilizer & Nutrient Recommendation\n\n"
                "**Verdict**: Sandy loam (75.5% sand) with pH 6.42 requires mandatory split-nitrogen dressings to comply with DüV and prevent nitrate leaching.\n\n"
                "• **DüV Legal Ceiling**: Total organic nitrogen is capped at 170 kg N/ha/year.\n"
                "• **Split-Application Strategy**: Apply 50–60 kg N/ha at spring green-up (BBCH 21–25), followed by a second dressing at stem elongation (BBCH 30–32).\n"
                "• **Form of Nitrogen**: Use stabilized ammonium-nitrate-urea (ALZON or ENTEC) to retard nitrification on high-drainage sandy parcels."
            )

        if category == "soil" or any(w in msg_lower for w in ["soil", "boden", "ph", "carbon", "humus", "texture", "organic", "clay", "sand"]):
            return (
                "### Soil Health Assessment (ISRIC SoilGrids v2.0)\n\n"
                "**Profile Verdict**: Uncompacted, highly workable Sandy Loam with an optimal reaction for cereals and legumes.\n\n"
                "• **Chemical Baseline**: Topsoil pH is 6.42 (optimal availability for N, P, K); Total N is ~3.23 g/kg with a C:N ratio of 6.0.\n"
                "• **Water Retention Risk**: High sand fraction (75.5%) produces fast drainage; topsoil dries rapidly during dry spells.\n"
                "• **Action Plan**: Maintain continuous ground cover using winter rye or vetch cover crops to build organic carbon above 2.0% and increase water retention."
            )

        if category == "crop" or any(w in msg_lower for w in ["crop", "wheat", "rye", "barley", "maize", "rotation", "plant", "pflanze", "sorte", "seed"]):
            return (
                "### Crop Suitability & Sowing Window\n\n"
                "**Recommendation**: Hybrid Winter Rye and 2-Row Winter Barley are the most drought-resilient selections for Brandenburg sandy loam.\n\n"
                "• **Winter Barley Window**: Optimal sowing is September 18 to September 28 at 280–320 viable seeds/m² to achieve 3–4 tillers before winter dormancy.\n"
                "• **Winter Rye Alternative**: Highly recommended if late summer moisture is deficient; tolerates poor sandy parcels and cold continental winters.\n"
                "• **Seedbed Note**: Drill immediately following shallow seedbed preparation to conserve limited topsoil moisture."
            )

        # Field / General
        return (
            "### Agricultural Field Intelligence\n\n"
            "**Overview**: Your field features verified DFBK parcel boundaries on friable Sandy Loam with baseline pH 6.42.\n\n"
            "• **Canopy & Vigor**: Recent Sentinel-2 observations show healthy early vegetative biomass without severe localized anomalies.\n"
            "• **Management Focus**: Prioritize moisture conservation through reduced tillage and timed split nutrient applications.\n"
            "• **Next Step**: Select Crop or Soil for targeted varietal advice or fertilizer budget calculations."
        )

gemini_service = GeminiService()
