# Smoke-checklist для валидации обязательных полей

Перед каждым сценарием заполните базовые обязательные поля:
`LBXHGB`, `LBXMCVSI`, `LBXMCHSI`, `LBXRDW`, `LBXRBCSI`, `LBXHCT`, `RIDAGEYR`.

## Сценарии

1. **Только BMI (`BMXBMI`)**
   - Заполнить `BMXBMI`, оставить `BMXHT` и `BMXWT` пустыми.
   - Нажать «Рассчитать риск».
   - **Ожидание:** клиентская валидация проходит (нет `frontend_needs_input`), выполняется POST.

2. **Только рост + вес (`BMXHT` и `BMXWT`)**
   - Оставить `BMXBMI` пустым.
   - Заполнить `BMXHT` и `BMXWT`.
   - Нажать «Рассчитать риск».
   - **Ожидание:** клиентская валидация проходит (нет `frontend_needs_input`), выполняется POST.

3. **Ни BMI, ни пары рост+вес**
   - Оставить пустыми `BMXBMI`, `BMXHT`, `BMXWT`.
   - Нажать «Рассчитать риск».
   - **Ожидание:** в `missing_required_fields` есть `BMXBMI_or_BMXHT_BMXWT`.
