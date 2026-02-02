pipeline {
  agent any

  environment {
    REGISTRY = "docker.io/YOURUSER"
    APP = "myapp"
    NAMESPACE = "myapp"
    TAG = "${env.GIT_COMMIT}".take(12)
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {

    stage("Checkout") {
      steps {
        checkout scm
        sh "git rev-parse --short=12 HEAD"
      }
    }

    stage("Unit Tests") {
      parallel {
        stage("API Tests") {
          steps { sh "cd services/api && npm ci && npm test" }
        }
        stage("Worker Tests") {
          steps { sh "cd services/worker && npm ci && npm test" }
        }
        stage("Frontend Tests") {
          steps { sh "cd services/frontend && npm ci && npm test || true" } // optional
        }
      }
    }

    stage("Build & Push Images") {
      steps {
        withCredentials([usernamePassword(credentialsId: "docker-registry-creds", usernameVariable: "DOCKER_USER", passwordVariable: "DOCKER_PASS")]) {
          sh """
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin

            docker build -t $REGISTRY/$APP-api:$TAG services/api
            docker build -t $REGISTRY/$APP-worker:$TAG services/worker
            docker build -t $REGISTRY/$APP-frontend:$TAG services/frontend

            docker push $REGISTRY/$APP-api:$TAG
            docker push $REGISTRY/$APP-worker:$TAG
            docker push $REGISTRY/$APP-frontend:$TAG
          """
        }
      }
    }

    stage("Deploy to Kubernetes (Dev)") {
      steps {
        withCredentials([file(credentialsId: "kubeconfig-mycluster", variable: "KUBECONFIG_FILE")]) {
          sh """
            export KUBECONFIG=$KUBECONFIG_FILE

            kubectl apply -f k8s/base/namespace.yaml

            # Render kustomize overlay with correct tags
            sed -i.bak 's|REGISTRY|$REGISTRY|g; s|TAG|$TAG|g' k8s/overlays/dev/kustomization.yaml

            kubectl apply -k k8s/overlays/dev

            # Run migrations as a one-off job (example)
            kubectl -n $NAMESPACE delete job db-migrate --ignore-not-found=true
            kubectl -n $NAMESPACE apply -f - <<'YAML'
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  backoffLimit: 1
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: $REGISTRY/$APP-api:$TAG
          command: ["node","dist/migrate.js"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef: { name: myapp-secrets, key: databaseUrl }
YAML

            kubectl -n $NAMESPACE wait --for=condition=complete job/db-migrate --timeout=180s

            kubectl -n $NAMESPACE rollout status deploy/api --timeout=180s
            kubectl -n $NAMESPACE rollout status deploy/worker --timeout=180s
            kubectl -n $NAMESPACE rollout status deploy/frontend --timeout=180s
          """
        }
      }
    }

    stage("Smoke Test") {
      steps {
        withCredentials([file(credentialsId: "kubeconfig-mycluster", variable: "KUBECONFIG_FILE")]) {
          sh """
            export KUBECONFIG=$KUBECONFIG_FILE
            # Example: port-forward API and hit /health
            kubectl -n $NAMESPACE port-forward svc/api 13000:3000 >/tmp/pf.log 2>&1 &
            PF_PID=$!
            sleep 2
            curl -fsS http://127.0.0.1:13000/health
            kill $PF_PID
          """
        }
      }
    }
  }

  post {
    always {
      cleanWs()
    }
  }
}
