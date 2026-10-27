import * as THREE from 'three';
import { KartModel } from '../game/KartModel';

/** A real, paintable kart showcase. Rendering sleeps outside the home screen. */
export class GaragePreview {
  readonly el = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, .1, 30);
  private kart: KartModel;
  private active = false;
  private last = 0;
  private raf = 0;
  constructor(color: string) {
    this.el.className = 'garage-preview'; this.el.setAttribute('aria-label', 'Live preview of your kart');
    this.renderer = new THREE.WebGLRenderer({canvas:this.el,alpha:true,antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.add(new THREE.HemisphereLight('#e2f5ff','#737d9e',2));
    const sun = new THREE.DirectionalLight('#fff0d6',2.5); sun.position.set(3,5,4); this.scene.add(sun);
    this.kart = new KartModel(color); this.scene.add(this.kart.root);
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.4,.15,48),new THREE.MeshStandardMaterial({color:'#315c82',roughness:.5}));
    podium.position.y=-.1; this.scene.add(podium);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.26,.025,6,48).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:'#8de5ff'}));
    rim.position.y=-.015; this.scene.add(rim);
    this.camera.position.set(2.8,2.2,3.8); this.camera.lookAt(0,.65,0);
  }
  setColor(color:string) { this.kart.setColor(color); }
  setActive(active:boolean) { if(this.active===active)return; this.active=active; if(active){this.last=performance.now();this.raf=requestAnimationFrame(this.frame);}else cancelAnimationFrame(this.raf); }
  private frame = (now:number) => {
    if(!this.active)return;
    const dt=Math.min(.05,(now-this.last)/1000);this.last=now;
    if(!document.hidden){
      const w=this.el.clientWidth||400,h=this.el.clientHeight||280;
      if(this.el.width!==Math.round(w*this.renderer.getPixelRatio())||this.el.height!==Math.round(h*this.renderer.getPixelRatio())){this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
      this.kart.root.rotation.y=Math.sin(now*.00022)*.45-.25;
      this.kart.animate(dt,0,Math.sin(now*.001)*.2);this.renderer.render(this.scene,this.camera);
    }
    this.raf=requestAnimationFrame(this.frame);
  };
}
