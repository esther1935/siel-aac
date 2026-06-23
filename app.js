* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif;
  background: #fffaf0;
  color: #222;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: grid;
  grid-template-columns: 60px 1fr 70px;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #fff7d6;
  border-bottom: 2px solid #eadca4;
}
h1 { margin: 0; text-align: center; font-size: 24px; }
h2 { margin: 0 0 10px; font-size: 19px; }
button {
  border: 0;
  border-radius: 16px;
  padding: 13px 16px;
  font-size: 18px;
  background: #eee;
}
.ghost { background: #fff; border: 1px solid #ddd; }
.primary { background: #f6c85f; font-weight: 800; }
.hidden { display: none !important; }
main { padding: 14px; }
.status {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid #eee;
  font-size: 14px;
}
.panel {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #eee;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
  gap: 14px;
}
.grid.small {
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
}
.card {
  min-height: 150px;
  border-radius: 24px;
  background: white;
  border: 2px solid #e7e7e7;
  box-shadow: 0 3px 10px rgba(0,0,0,.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card img {
  width: 100%;
  height: 110px;
  object-fit: cover;
  background: #f4f4f4;
}
.card .label {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 10px;
  font-size: 23px;
  font-weight: 800;
  text-align: center;
  line-height: 1.2;
}
.categoryCard .label { font-size: 28px; min-height: 130px; }
dialog {
  border: 0;
  border-radius: 24px;
  padding: 18px;
  width: min(94vw, 720px);
  background: white;
}
dialog::backdrop { background: rgba(0,0,0,.35); }
.close {
  float: right;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  font-size: 28px;
}
#viewer { text-align: center; }
#viewerImg {
  max-width: 100%;
  max-height: 55vh;
  border-radius: 24px;
  margin-top: 20px;
}
#viewerText {
  margin: 18px 0;
  font-size: 42px;
  font-weight: 900;
}
.adminBox {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
input, select {
  width: 100%;
  padding: 14px;
  font-size: 18px;
  border-radius: 14px;
  border: 1px solid #ccc;
}
label { font-weight: 800; margin-top: 6px; }
hr { width: 100%; border: 0; border-top: 1px solid #eee; margin: 12px 0; }
.deleteList {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.deleteItem {
  display: grid;
  grid-template-columns: 52px 1fr 80px;
  align-items: center;
  gap: 8px;
}
.deleteItem img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 10px;
}
.importLabel {
  background: #eee;
  padding: 13px 16px;
  border-radius: 16px;
  text-align: center;
}
.importLabel input { display: none; }
.help { font-size: 13px; color: #666; line-height: 1.5; }
@media (min-width: 800px) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  .card img { height: 135px; }
}
