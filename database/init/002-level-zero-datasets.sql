INSERT INTO catalog_dataset (dataset_id, dataset_name) VALUES
    ('sin-cruces', 'Escenario sin cruces'),
    ('conflicto-obligatorio', 'Escenario de conflicto obligatorio'),
    ('cruce-anidado-y-limite', 'Escenario de cruce anidado y límite');

INSERT INTO level_zero_test_case (dataset_id, description, expected_schedule_count) VALUES
    ('sin-cruces', 'Todas las secciones de los cursos son compatibles.', 4),
    ('conflicto-obligatorio', 'Las únicas secciones disponibles se cruzan.', 0),
    ('cruce-anidado-y-limite', 'Incluye un cruce contenido y sesiones contiguas.', 6);

INSERT INTO course (dataset_id, course_id, course_name) VALUES
    ('sin-cruces', 'A', 'Algoritmos'),
    ('sin-cruces', 'E', 'Estadística'),
    ('conflicto-obligatorio', 'A', 'Algoritmos'),
    ('conflicto-obligatorio', 'E', 'Estadística'),
    ('cruce-anidado-y-limite', 'A', 'Algoritmos'),
    ('cruce-anidado-y-limite', 'E', 'Estadística'),
    ('cruce-anidado-y-limite', 'S', 'Software');

INSERT INTO course_section (dataset_id, course_id, section_id) VALUES
    ('sin-cruces', 'A', 'A1'),
    ('sin-cruces', 'A', 'A2'),
    ('sin-cruces', 'E', 'E1'),
    ('sin-cruces', 'E', 'E2'),
    ('conflicto-obligatorio', 'A', 'A1'),
    ('conflicto-obligatorio', 'E', 'E1'),
    ('cruce-anidado-y-limite', 'A', 'A1'),
    ('cruce-anidado-y-limite', 'A', 'A2'),
    ('cruce-anidado-y-limite', 'E', 'E1'),
    ('cruce-anidado-y-limite', 'E', 'E2'),
    ('cruce-anidado-y-limite', 'S', 'S1'),
    ('cruce-anidado-y-limite', 'S', 'S2');

INSERT INTO section_meeting (dataset_id, course_id, section_id, day_of_week, start_minute, end_minute) VALUES
    ('sin-cruces', 'A', 'A1', 1, 480, 540),
    ('sin-cruces', 'A', 'A2', 1, 600, 660),
    ('sin-cruces', 'E', 'E1', 2, 480, 540),
    ('sin-cruces', 'E', 'E2', 2, 600, 660),
    ('conflicto-obligatorio', 'A', 'A1', 1, 480, 600),
    ('conflicto-obligatorio', 'E', 'E1', 1, 540, 660),
    ('cruce-anidado-y-limite', 'A', 'A1', 1, 480, 600),
    ('cruce-anidado-y-limite', 'A', 'A2', 2, 480, 600),
    ('cruce-anidado-y-limite', 'E', 'E1', 1, 540, 570),
    ('cruce-anidado-y-limite', 'E', 'E2', 3, 480, 540),
    ('cruce-anidado-y-limite', 'S', 'S1', 2, 600, 660),
    ('cruce-anidado-y-limite', 'S', 'S2', 5, 780, 840);
