# SonarQube project templates

Copy the template for your language to the root of the project repository as
`sonar-project.properties` and edit the paths. `jenkins/CI.JenkinsFile` uses the file
when it exists; the project key, name, server URL and token still come from the
pipeline, so leave them out of the file.

| Template | Language / build | Coverage report it expects | How to produce it |
|---|---|---|---|
| `node.sonar-project.properties` | JavaScript / TypeScript | `coverage/lcov.info` | Jest: `jest --coverage` · Vitest: `vitest run --coverage --coverage.reporter=lcov` |
| `python.sonar-project.properties` | Python | `coverage.xml` | `pytest --cov=src --cov-report=xml` |
| `maven.sonar-project.properties` | Java (Maven) | `target/site/jacoco/jacoco.xml` | JaCoCo plugin: `mvn verify` with the `report` goal bound |

The "Industry Standard" quality gate (`sonarqube/scripts/setup-quality.sh`) requires
80 % coverage on new code. Without a coverage report that condition always fails, and
the pipeline fails the build when the gate is not `OK`.

No Dart / Flutter template: the pinned SonarQube Community image has no Dart analyzer
(its plugins are Java, JaCoCo, JavaScript/TypeScript and Python), so Dart files are not
analysed and Flutter coverage cannot count toward the gate.

The tests must run **before** the SonarQube stage so the report exists when the scanner
starts.
