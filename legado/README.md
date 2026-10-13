# Legado

Versiones anteriores del proyecto, **solo como referencia histórica**. No se usan en la app.

| Archivo | Qué era | Por qué se reemplazó |
|---|---|---|
| `apps-script-google-sheets.gs` | Primera versión (septiembre de 2026): guardaba los registros en una hoja de cálculo de Google y enviaba el enlace de la encuesta desde Gmail | Una hoja de cálculo no es segura ni eficiente para datos de usuarios. Se reemplazó por el servidor Node.js con PostgreSQL. Ver `docs/contexto-del-proyecto.md` |
