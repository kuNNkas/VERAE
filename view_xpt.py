"""
Скрипт для просмотра SAS Transport (.xpt) файлов
"""
import pandas as pd

# Читаем XPT файл
file_path = "FERTIN_E.xpt"

try:
    df = pd.read_sas(file_path, format='xport')
    
    print(f"Файл: {file_path}")
    print(f"Количество строк: {len(df)}")
    print(f"Количество столбцов: {len(df.columns)}")
    print(f"\nСтолбцы: {list(df.columns)}")
    print(f"\nПервые 20 строк данных:")
    print("-" * 80)
    
    # Показываем все столбцы
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', None)
    pd.set_option('display.max_colwidth', 50)
    
    print(df.head(20).to_string())
    
    # Сохраняем в CSV для удобного просмотра
    csv_path = file_path.replace('.xpt', '.csv')
    df.to_csv(csv_path, index=False)
    print(f"\n\nДанные сохранены в CSV: {csv_path}")
    
except Exception as e:
    print(f"Ошибка: {e}")
