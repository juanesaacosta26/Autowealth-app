# Cómo trabajamos

Cinco personas tocando el mismo código necesitan reglas simples. Estas son las nuestras.

## La regla principal

**Nadie trabaja directamente en `main`.** `main` es lo que está publicado en Render: cada cambio que llega ahí sale a internet en 2 minutos. Todo cambio entra por un **Pull Request (PR)** revisado por otra persona y con la revisión automática en verde ✅.

```
main ────●──────────────●──────────────●────►  (siempre funciona; se publica sola)
          \            ↗ \            ↗
           tu rama ●──●   otra rama ●─●       (aquí trabajas)
                   commits        PR + revisión
```

## Flujo de cada tarea

### Con GitHub Desktop (sin comandos)
1. **Actualiza:** arriba, *Current branch* → `main` → **Fetch origin** → **Pull origin**.
2. **Crea tu rama:** *Current branch* → **New branch** → nombre (ver abajo) → *Create branch*.
3. **Trabaja** en VS Code. Prueba con `npm run dev`.
4. **Guarda (commit):** en GitHub Desktop verás tus cambios. Escribe el mensaje abajo a la izquierda → **Commit to tu-rama**.
5. **Sube:** **Publish branch** (la primera vez) o **Push origin**.
6. **Abre el PR:** **Create Pull Request** → se abre GitHub → llena la plantilla → elige un revisor → **Create pull request**.
7. **Cuando lo aprueben** y la revisión automática esté en verde: **Merge pull request** → **Delete branch**.

### Con la terminal
```bash
git checkout main
git pull                                        # 1. traer lo último
git checkout -b feature/juanes-presupuestos     # 2. rama nueva
# ... trabajar ...
git add -A
git commit -m "api: agrega rutas de presupuestos"   # 4. guardar
git push -u origin feature/juanes-presupuestos      # 5. subir
# 6. abrir el PR en github.com (aparece un botón amarillo "Compare & pull request")
```

### Nombres de ramas
`feature/<persona>-<tema>` para algo nuevo · `fix/<persona>-<tema>` para corregir · `docs/<persona>-<tema>` para documentación.
Ejemplos: `feature/david-metas`, `fix/aleja-enlace-terminos`, `docs/garavito-diagrama`.

### Mensajes de commit
`<área>: <qué hiciste, en presente>`. Cortos y concretos.

| ✅ Bien | ❌ Mal |
|---|---|
| `api: agrega validación del límite de presupuesto` | `cambios` |
| `panel: muestra barra de progreso de metas` | `arreglé cosas` |
| `bd: crea tabla tokens_recuperacion` | `final final v2` |

Áreas: `api`, `bd`, `inicio`, `panel`, `infra`, `seguridad`, `pruebas`, `docs`.

## Revisar un PR (cuando te lo asignan)
1. Lee la descripción y los archivos cambiados (pestaña **Files changed**).
2. Si cambia algo visual o un flujo: descarga la rama y pruébala (`git fetch` y luego `git checkout nombre-rama`, o en GitHub Desktop elígela en *Current branch*).
3. Revisa la [lista de seguridad](docs/seguridad-y-cumplimiento.md#lista-de-revisión-rápida-para-cada-pull-request).
4. Comenta con respeto y en concreto (*"aquí falta filtrar por usuario_id"*, no *"está mal"*).
5. **Approve** si está bien, o **Request changes** si hay que corregir. Intenta revisar en menos de 24 horas: alguien está esperando.

## Mantener tu rama al día
Si tu rama tiene varios días, trae lo nuevo de `main` para evitar sorpresas:
```bash
git checkout main && git pull
git checkout tu-rama
git merge main
```
En GitHub Desktop: estando en tu rama → **Branch → Update from main**.

### Si aparece un conflicto
Git te dice qué archivos chocaron. Ábrelos en VS Code: verás `<<<<<<<`, `=======` y `>>>>>>>`. VS Code muestra botones (*Accept Current / Incoming / Both*). Elige con cuidado, borra las marcas, prueba que funcione y haz commit. **Si el conflicto es en el archivo de otra persona, llámala.**

Para tener menos conflictos: PR pequeños (un tema por PR), fusiona seguido y respeta las áreas de cada uno (ver [arquitectura.md](docs/arquitectura.md#mapa-del-código-y-responsables)).

## Pruebas automáticas
- Cada PR corre la **revisión automática** (`.github/workflows/ci.yml`): revisa la sintaxis de todos los `.js` y corre `npm test` con una base de datos temporal.
- Para correrlas en tu computador:
  ```powershell
  # Windows (PowerShell)
  $env:TEST_DATABASE_URL="postgresql://...(rama pruebas de Neon)..."; npm test
  ```
  ```bash
  # Mac / Linux
  TEST_DATABASE_URL="postgresql://..." npm test
  ```
- **Si agregas una ruta, agrega su prueba** en `tests/`. Copia el estilo de `tests/api.test.js`.

## Estilo del código
- **Español** en nombres, comentarios y mensajes al usuario (español de Colombia, trato de "tú").
- JavaScript con `require` (CommonJS), 2 espacios, comillas simples, punto y coma.
- Comentarios que expliquen el **porqué**, como los que ya tiene el código.
- **No agregues librerías** (`npm install algo`) sin hablarlo con el equipo: el proyecto tiene una sola dependencia a propósito.

## Lo que nunca se sube
- `.env` ni ninguna clave (ya está en `.gitignore`; revisa antes de hacer commit).
- `node_modules/`.
- Datos reales de personas (exportes de la base de datos, CSV de usuarios).

Si subiste una clave por error: **avisa de inmediato** a Samu. Hay que cambiarla (borrar el commit no basta: GitHub guarda el historial).
