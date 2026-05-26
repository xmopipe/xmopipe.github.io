import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PLAY_SVG = `<polygon points="0,0 10,6 0,12"/>`;
const PAUSE_SVG = `<rect x="1" y="0" width="3" height="12"/><rect x="6" y="0" width="3" height="12"/>`;

const loaderEl = document.getElementById('loader');
const navHint = document.getElementById('nav-hint');
let navHintShown = false;
const progEl = document.getElementById('prog');
const subEl = document.getElementById('loader-sub');
const playBtn = document.getElementById('play-btn');
const playIcon = document.getElementById('play-icon');
const seqLabel = document.getElementById('seq-label');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
document.getElementById('app').appendChild(renderer.domElement);

// --- Background vidéo MP4 via CanvasTexture ---
const bgCanvas = document.getElementById('gif-canvas');
const bgCtx = bgCanvas.getContext('2d');
let bgTexture = null;
let bgVideo = null;

function setBgTexture(n) {
  if (bgVideo) { bgVideo.pause(); bgVideo.removeAttribute('src'); bgVideo.load(); bgVideo = null; }
  if (bgTexture) { bgTexture.dispose(); bgTexture = null; }
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  backdropMat.map = null;
  backdropMat.color.set(0xcccccc);
  backdropMat.needsUpdate = true;

  const url = `./seq_mp4/${n}.mp4`;
  const video = document.createElement('video');
  video.src = url;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  bgVideo = video;

  video.addEventListener('canplay', () => {
    if (bgVideo !== video) return;
    bgCanvas.width = video.videoWidth;
    bgCanvas.height = video.videoHeight;
    bgTexture = new THREE.CanvasTexture(bgCanvas);
    bgTexture.colorSpace = THREE.SRGBColorSpace;
    bgTexture.generateMipmaps = false;
    bgTexture.minFilter = THREE.LinearFilter;
    bgTexture.magFilter = THREE.LinearFilter;
    bgTexture.repeat.x = -1;
    bgTexture.offset.x = 1;
    backdropMat.map = bgTexture;
    backdropMat.color.set(0xffffff);
    backdropMat.needsUpdate = true;
    const aspect = video.videoWidth / video.videoHeight;
    const h = 6;
    backdropMesh.geometry.dispose();
    backdropMesh.geometry = new THREE.PlaneGeometry(h * aspect, h);
    video.play().catch(() => { });
  }, { once: true });

  video.load();
}

// --- Main scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f5f5);
scene.fog = new THREE.FogExp2(0xf5f5f5, 0.04);

// Plan de fond (mur arrière)
const backdropMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
const backdropMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), backdropMat);
backdropMesh.position.set(0, 3, 8);
scene.add(backdropMesh);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.2, 4.5);

scene.add(new THREE.AmbientLight(0xffffff, 1.8));

const key = new THREE.DirectionalLight(0xffffff, 4.0);
key.position.set(3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);

const fill = new THREE.DirectionalLight(0xaaddff, 1.5);
fill.position.set(-4, 3, 2);
scene.add(fill);

const back = new THREE.DirectionalLight(0xffffff, 1.0);
back.position.set(0, 3, -4);
scene.add(back);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 12),
  new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 1, transparent: true, opacity: 0.5 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(12, 24, 0xcccccc, 0xdddddd);
grid.position.y = 0.001;
scene.add(grid);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1;
controls.maxDistance = 20;
controls.target.set(0, 0.9, 0);
controls.update();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();

let current = null;
let mixer = null;
let action = null;
let playing = true;

function fitCamera(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  object.position.x -= center.x;
  object.position.z -= center.z;

  const fov = camera.fov * (Math.PI / 180);
  const dist = (Math.max(size.x, size.y, size.z) / (2 * Math.tan(fov / 2))) * 1.6;

  camera.position.set(0, size.y * 0.55, -dist);
  controls.target.set(0, size.y * 0.45, 0);
  controls.update();
}

function loadSequence(n) {
  loaderEl.classList.remove('hidden');
  progEl.style.width = '0%';
  subEl.textContent = `Sequence ${n} …`;
  seqLabel.textContent = String(n).padStart(2, '0');

  if (current) { scene.remove(current); current = null; }
  if (mixer) { mixer.stopAllAction(); mixer = null; action = null; }

  setBgTexture(n);

  gltfLoader.load(
    `./seq_glb/${n}.glb`,
    (gltf) => {
      current = gltf.scene;
      current.traverse(obj => {
        if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
      });
      scene.add(current);
      fitCamera(current);

      if (gltf.animations?.length > 0) {
        mixer = new THREE.AnimationMixer(current);
        action = mixer.clipAction(gltf.animations[0]);
        action.play();
        playing = true;
        playIcon.innerHTML = PAUSE_SVG;
      }

      progEl.style.width = '100%';
      setTimeout(() => {
        loaderEl.classList.add('hidden');
        if (!navHintShown) { navHintShown = true; navHint.classList.add('visible'); }
      }, 300);
    },
    (xhr) => { if (xhr.total) progEl.style.width = (xhr.loaded / xhr.total * 100).toFixed(0) + '%'; },
    (err) => { subEl.textContent = `Erreur : ${n}.glb introuvable.`; console.error(err); }
  );
}

playBtn.addEventListener('click', () => {
  if (!action) return;
  playing = !playing;
  action.paused = !playing;
  playIcon.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
});

document.querySelectorAll('.seq-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seq-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadSequence(btn.dataset.seq);
  });
});

loadSequence('1');

function animate() {
  requestAnimationFrame(animate);
  if (mixer && playing) mixer.update(clock.getDelta());
  if (bgVideo && bgTexture && bgVideo.readyState >= 2) {
    bgCtx.drawImage(bgVideo, 0, 0, bgCanvas.width, bgCanvas.height);
    bgTexture.needsUpdate = true;
  }
  renderer.render(scene, camera);
  controls.update();
}
animate();