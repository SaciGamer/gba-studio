import { EVENT_CATALOG } from '../../../../shared/events/eventCatalog';
import type { AppLanguage } from './I18n';

// Related codes can share help text. Their individual labels below keep the
// picker unambiguous, including commands with equivalent runtime behavior.
const events = [
  ['EVENT_CAMERA_STOP_FOLLOW', 'Câmera: parar de seguir', 'Cámara: dejar de seguir', 'Caméra : arrêter le suivi', 'Stops camera follow and clears its target, axis locks, central area and persistence without changing the current camera position.', 'Para o Follow e limpa o alvo, as travas de eixo, a área central e a persistência sem mudar a posição atual da câmera.', 'Detiene el seguimiento y borra el objetivo, los bloqueos de eje, el área central y la persistencia sin cambiar la posición actual de la cámara.', 'Arrête le suivi et réinitialise la cible, les axes verrouillés, la zone centrale et la persistance sans changer la position actuelle de la caméra.'],
  ['EVENT_ACTOR_SET_DIRECTION', 'Definir dire??o do ator', 'Definir direcci?n del actor', 'D?finir la direction de l?acteur', 'Faces an actor or player up, right, down or left without moving it.', 'Faz um ator ou player olhar para cima, direita, baixo ou esquerda sem mov?-lo.', 'Orienta un actor o jugador arriba, derecha, abajo o izquierda sin moverlo.', 'Oriente un acteur ou joueur en haut, ? droite, en bas ou ? gauche sans le d?placer.'],
  ['EVENT_TRIGGER_SET_ENABLED', 'Ativar/desativar trigger', 'Activar/desactivar trigger', 'Activer/désactiver un déclencheur', 'Enables or disables a trigger in the current scene.', 'Ativa ou desativa um trigger da cena atual.', 'Activa o desactiva un trigger de la escena actual.', 'Active ou désactive un déclencheur de la scène actuelle.'],
  ['EVENT_ACTOR_SET_ROTATION', 'Rotacionar ator', 'Rotar actor', 'Tourner un acteur', 'Sets actor rotation without changing scale, color or visibility.', 'Define a rotação do ator sem alterar escala, cor ou visibilidade.', 'Define la rotación sin cambiar escala, color o visibilidad.', 'Définit la rotation sans changer échelle, couleur ou visibilité.'],
  ['EVENT_ACTOR_SET_SCALE', 'Redimensionar ator', 'Redimensionar actor', 'Redimensionner un acteur', 'Sets visual scale without changing rotation, color, visibility or collider.', 'Define a escala visual sem alterar rotação, cor, visibilidade ou colisor.', 'Define la escala visual sin cambiar rotación, color, visibilidad o colisión.', 'Définit l’échelle visuelle sans changer rotation, couleur, visibilité ou collision.'],
  ['EVENT_IF_ACTOR_FACING', 'Se o ator estiver olhando para o alvo', 'Si el actor mira al objetivo', 'Si l’acteur regarde la cible', 'Branches based on whether an actor or player faces another actor or player.', 'Escolhe um caminho se um ator ou player estiver olhando para outro ator ou player.', 'Elige una rama si un actor o jugador mira a otro actor o jugador.', 'Choisit une branche selon la direction d’un acteur ou joueur vers une cible.'],
  ['EVENT_CHANGE_DEFAULT_PALETTES', 'Trocar paletas padrão', 'Cambiar paletas predeterminadas', 'Changer les palettes par défaut', 'Replaces shared default palette slots for every tile and layer using them. Empty fields restore the Settings default.', 'Substitui os slots de paleta compartilhados para todos os tiles e camadas que os utilizam. Campos vazios restauram o padrão de Settings.', 'Sustituye los slots compartidos para todos los tiles y capas que los usan. Los campos vacíos restauran los valores de Settings.', 'Remplace les emplacements partagés pour toutes les tuiles et tous les calques qui les utilisent. Les champs vides rétablissent les valeurs de Settings.'],
  ['EVENT_BACKGROUND_ANIMATE', 'Animar fundo', 'Animar fondo', 'Animer le fond', 'Loads a background sheet into a layer and plays its frames once or in a loop, with direction, displacement and speed.', 'Carrega uma sequência de frames de fundo em uma camada, uma vez ou em loop, com direção, deslocamento e velocidade.', 'Carga una secuencia de fondo en una capa, una vez o en bucle, con dirección, desplazamiento y velocidad.', 'Charge une séquence de fond sur un calque, une fois ou en boucle, avec direction, déplacement et vitesse.'],
  ['EVENT_ACTOR_SET_TINT', 'Sobrepor cor no ator', 'Superponer color al actor', 'Colorer l’acteur', 'Applies Butano’s native color overlay to the palette used by the actor.', 'Aplica a sobreposição de cor nativa do Butano à paleta usada pelo ator.', 'Aplica la superposición de color nativa de Butano a la paleta del actor.', 'Applique la superposition de couleur native de Butano à la palette de l’acteur.'],
  ['EVENT_ACTOR_SET_SATURATION', 'Saturação do ator', 'Saturación del actor', 'Saturation de l’acteur', 'Sets actor saturation: 0% is grayscale and 100% preserves the original colors.', 'Define a saturação do ator: 0% é cinza e 100% preserva as cores originais.', 'Define la saturación del actor: 0% es gris y 100% conserva los colores originales.', 'Définit la saturation : 0 % en gris, 100 % pour les couleurs originales.'],
  ['EVENT_ACTOR_SET_BRIGHTNESS', 'Iluminação do ator', 'Iluminación del actor', 'Luminosité de l’acteur', 'Darkens or brightens the selected actor. Zero preserves the original brightness.', 'Escurece ou ilumina o ator selecionado. Zero preserva a iluminação original.', 'Oscurece o ilumina al actor seleccionado. Cero conserva la luminosidad original.', 'Assombrit ou éclaircit l’acteur. Zéro conserve la luminosité originale.'],
  ['EVENT_ACTOR_SET_OPACITY', 'Opacidade do ator', 'Opacidad del actor', 'Opacité de l’acteur', 'Sets actor opacity. The GBA shares its alpha coefficient between translucent objects.', 'Define a opacidade do ator. O GBA compartilha o coeficiente alpha entre objetos translúcidos.', 'Define la opacidad del actor. GBA comparte el coeficiente alfa entre objetos translúcidos.', 'Définit l’opacité. Le GBA partage le coefficient alpha entre les objets translucides.'],
  ['EVENT_BACKGROUND_SET_SCALE', 'Escalar fundo', 'Escalar fondo', 'Redimensionner le fond', 'Sets horizontal and vertical background scale. Tiled layers are prepared as affine backgrounds.', 'Define a escala horizontal e vertical do fundo. Camadas de tiles são preparadas como affine.', 'Define la escala horizontal y vertical del fondo. Las capas de tiles se preparan como affine.', 'Définit l’échelle horizontale et verticale du fond. Les calques de tuiles sont préparés en affine.'],
  ['EVENT_BACKGROUND_SET_ROTATION', 'Girar fundo', 'Girar fondo', 'Faire pivoter le fond', 'Sets the background rotation in degrees. Zero restores the original angle.', 'Define a rotação do fundo em graus. Zero restaura o ângulo original.', 'Define la rotación del fondo en grados. Cero restaura el ángulo original.', 'Définit la rotation du fond en degrés. Zéro rétablit l’angle initial.'],
  ['EVENT_BACKGROUND_SET_SHEAR', 'Inclinar fundo', 'Inclinar fondo', 'Incliner le fond', 'Sets horizontal and vertical background shear. Zero removes the shear.', 'Define a inclinação horizontal e vertical do fundo. Zero remove a inclinação.', 'Define la inclinación horizontal y vertical del fondo. Cero elimina la inclinación.', 'Définit le cisaillement horizontal et vertical du fond. Zéro annule le cisaillement.'],
  ['EVENT_RUN_BUTTON_ACTION', 'Executar ação de botão', 'Ejecutar acción de botón', 'Exécuter une action de bouton', 'Runs another button’s default or assigned action.', 'Executa a ação padrão ou personalizada de outro botão.', 'Ejecuta la acción predeterminada o asignada de otro botón.', 'Exécute l’action par défaut ou affectée à un autre bouton.'],
  ['EVENT_STOP_PHYSICS', 'Parar física', 'Detener física', 'Arrêter la physique', 'Clears the actor’s current movement and impulses.', 'Zera o movimento e os impulsos atuais do ator.', 'Reinicia el movimiento y los impulsos actuales del actor.', 'Annule le mouvement et les impulsions actuels de l’acteur.'],
  ['EVENT_CONFIGURE_MOVEMENT', 'Configurar física', 'Configurar física', 'Configurer la physique', 'Sets gravity, jump strength and air jumps for an actor.', 'Configura gravidade, força do pulo e pulos aéreos do ator.', 'Configura gravedad, fuerza de salto y saltos aéreos del actor.', 'Configure la gravité, la force du saut et les sauts aériens.'],
  ['EVENT_APPLY_VERTICAL_IMPULSE', 'Aplicar impulso vertical', 'Aplicar impulso vertical', 'Appliquer une impulsion verticale', 'Applies an upward or downward impulse, including in midair.', 'Aplica um impulso para cima ou para baixo, inclusive no ar.', 'Aplica un impulso hacia arriba o abajo, incluso en el aire.', 'Applique une impulsion verticale, même en plein vol.'],
  ['EVENT_ACTOR_SET_STATE', 'Definir estado do ator', 'Definir estado del actor', 'Définir l’état de l’acteur', 'Selects the actor’s animation state.', 'Seleciona o estado de animação do ator.', 'Selecciona el estado de animación del actor.', 'Sélectionne l’état d’animation de l’acteur.'],
  ['EVENT_SHOW_EMOTE', 'Exibir expressão', 'Mostrar expresión', 'Afficher une expression', 'Shows an emote above the selected actor.', 'Exibe uma expressão acima do ator selecionado.', 'Muestra una expresión sobre el actor seleccionado.', 'Affiche une expression au-dessus de l’acteur sélectionné.'],
  ['EVENT_WAIT', 'Aguardar', 'Esperar', 'Attendre', 'Pauses this script for a time or number of frames.', 'Pausa este script pelo tempo ou número de frames definido.', 'Pausa este script durante el tiempo o los frames indicados.', 'Suspend le script pendant la durée ou les frames indiquées.'],
  ['EVENT_FADE_IN', 'Revelar tela', 'Revelar pantalla', 'Révéler l’écran', 'Gradually reveals the scene.', 'Revela a cena gradualmente.', 'Revela la escena gradualmente.', 'Révèle progressivement la scène.'],
  ['EVENT_FADE_OUT', 'Ocultar tela gradualmente', 'Ocultar pantalla gradualmente', 'Masquer progressivement l’écran', 'Gradually covers the scene with the fade color.', 'Cobre a cena gradualmente com a cor de transição.', 'Cubre gradualmente la escena con el color de transición.', 'Recouvre progressivement la scène avec la couleur de transition.'],
  ['EVENT_FADE_OPTIONS', 'Configurar transição', 'Configurar transición', 'Configurer la transition', 'Chooses the color used by screen fades.', 'Escolhe a cor usada nas transições da tela.', 'Elige el color de las transiciones de pantalla.', 'Choisit la couleur des transitions de l’écran.'],
  ['EVENT_CHANGE_SCENE', 'Trocar cena', 'Cambiar escena', 'Changer de scène', 'Loads a scene and places the player at the chosen position.', 'Carrega uma cena e posiciona o jogador no local escolhido.', 'Carga una escena y coloca al jugador en la posición elegida.', 'Charge une scène et place le joueur à la position choisie.'],
  ['EVENT_PAN_CAMERA EVENT_CAMERA_MOVE_TO', 'Mover câmera', 'Mover cámara', 'Déplacer la caméra', 'Moves the camera to a position, instantly or with animation.', 'Move a câmera para uma posição, com ou sem animação.', 'Mueve la cámara a una posición, con o sin animación.', 'Déplace la caméra vers une position, avec ou sans animation.'],
  ['EVENT_CAMERA_FOLLOW', 'Câmera: seguir actor', 'Cámara: seguir actor', 'Caméra : suivre un acteur', 'Tracks an actor with scene bounds and a central dead zone.', 'Segue um actor com limites da cena e área central livre.', 'Sigue a un actor con límites de escena y zona central libre.', 'Suit un acteur avec les limites de scène et une zone centrale libre.'],
  ['EVENT_CAMERA_SHAKE', 'Tremer câmera', 'Sacudir cámara', 'Secouer la caméra', 'Shakes the camera with the chosen duration and strength.', 'Treme a câmera com a duração e intensidade escolhidas.', 'Sacude la cámara con la duración e intensidad elegidas.', 'Secoue la caméra avec la durée et l’intensité choisies.'],
  ['EVENT_MOVE_ACTOR EVENT_ACTOR_MOVE_TO', 'Mover ator', 'Mover actor', 'Déplacer un acteur', 'Moves an actor with configurable speed, path and collisions.', 'Move um ator com velocidade, trajeto e colisões configuráveis.', 'Mueve un actor con velocidad, ruta y colisiones configurables.', 'Déplace un acteur selon la vitesse, le trajet et les collisions choisis.'],
  ['EVENT_ACTOR_SET_POSITION', 'Definir posição do ator', 'Definir posición del actor', 'Définir la position de l’acteur', 'Places the actor directly at the specified coordinates.', 'Posiciona o ator diretamente nas coordenadas informadas.', 'Coloca al actor directamente en las coordenadas indicadas.', 'Place directement l’acteur aux coordonnées indiquées.'],
  ['EVENT_SPAWN_ACTOR EVENT_ACTOR_SPAWN', 'Criar ator', 'Crear actor', 'Créer un acteur', 'Spawns a scene actor or a new independent actor from a prefab.', 'Cria um ator da cena ou uma nova cópia independente de um prefab.', 'Crea un actor de la escena o una nueva copia independiente de un prefab.', 'Crée un acteur de la scène ou une nouvelle copie indépendante d’un prefab.'],
  ['EVENT_REMOVE_ACTOR EVENT_ACTOR_DESPAWN', 'Remover ator', 'Eliminar actor', 'Retirer un acteur', 'Removes the selected actor from the scene.', 'Remove o ator selecionado da cena.', 'Elimina el actor seleccionado de la escena.', 'Retire l’acteur sélectionné de la scène.'],
  ['EVENT_VISIBLE_ACTOR EVENT_ACTOR_SET_VISIBLE', 'Definir visibilidade do ator', 'Definir visibilidad del actor', 'Définir la visibilité de l’acteur', 'Shows or hides the selected actor.', 'Exibe ou oculta o ator selecionado.', 'Muestra u oculta el actor seleccionado.', 'Affiche ou masque l’acteur sélectionné.'],
  ['EVENT_HIDE_ACTOR', 'Ocultar ator', 'Ocultar actor', 'Masquer un acteur', 'Hides the selected actor’s sprite.', 'Oculta o sprite do ator selecionado.', 'Oculta el sprite del actor seleccionado.', 'Masque le sprite de l’acteur sélectionné.'],
  ['EVENT_SHOW_ACTOR', 'Exibir ator', 'Mostrar actor', 'Afficher un acteur', 'Shows the selected actor’s sprite.', 'Exibe o sprite do ator selecionado.', 'Muestra el sprite del actor seleccionado.', 'Affiche le sprite de l’acteur sélectionné.'],
  ['EVENT_HIDE_ALL_SPRITES', 'Ocultar todos os sprites', 'Ocultar todos los sprites', 'Masquer tous les sprites', 'Hides all actor sprites in the scene.', 'Oculta todos os sprites de atores da cena.', 'Oculta todos los sprites de actores de la escena.', 'Masque tous les sprites d’acteurs de la scène.'],
  ['EVENT_SHOW_ALL_SPRITES', 'Exibir todos os sprites', 'Mostrar todos los sprites', 'Afficher tous les sprites', 'Shows all actor sprites in the scene.', 'Exibe todos os sprites de atores da cena.', 'Muestra todos los sprites de actores de la escena.', 'Affiche tous les sprites d’acteurs de la scène.'],
  ['EVENT_SET_ANIMATION_SPEED', 'Definir velocidade da animação', 'Definir velocidad de animación', 'Définir la vitesse d’animation', 'Changes the selected actor’s animation speed.', 'Altera a velocidade da animação do ator selecionado.', 'Cambia la velocidad de animación del actor seleccionado.', 'Modifie la vitesse d’animation de l’acteur sélectionné.'],
  ['EVENT_ACTOR_SET_ANIMATION', 'Controlar animação do ator', 'Controlar animación del actor', 'Contrôler l’animation de l’acteur', 'Selects, plays, pauses or positions an actor animation.', 'Seleciona, reproduz, pausa ou posiciona uma animação do ator.', 'Selecciona, reproduce, pausa o posiciona una animación del actor.', 'Sélectionne, lance, suspend ou positionne une animation de l’acteur.'],
  ['EVENT_SET_ACTOR_PRIORITY', 'Definir prioridade do ator', 'Definir prioridad del actor', 'Définir la priorité de l’acteur', 'Changes the actor’s drawing priority relative to backgrounds.', 'Altera a prioridade de desenho do ator em relação aos fundos.', 'Cambia la prioridad de dibujo del actor respecto a los fondos.', 'Modifie la priorité d’affichage de l’acteur par rapport aux fonds.'],
  ['EVENT_PLAY_MUSIC', 'Reproduzir música', 'Reproducir música', 'Jouer une musique', 'Starts a music track with the chosen volume and loop mode.', 'Inicia uma música com o volume e a repetição escolhidos.', 'Inicia una música con el volumen y la repetición elegidos.', 'Lance une musique avec le volume et la répétition choisis.'],
  ['EVENT_MUSIC_PLAY_JINGLE', 'Reproduzir vinheta musical', 'Reproducir melodía breve', 'Jouer une mélodie courte', 'Plays a short musical jingle.', 'Reproduz uma vinheta musical curta.', 'Reproduce una melodía musical breve.', 'Joue une courte mélodie musicale.'],
  ['EVENT_PLAY_SOUND', 'Reproduzir som', 'Reproducir sonido', 'Jouer un son', 'Plays an imported or generated sound effect.', 'Reproduz um efeito sonoro importado ou gerado.', 'Reproduce un efecto sonoro importado o generado.', 'Joue un effet sonore importé ou généré.'],
  ['EVENT_RUMBLE', 'Vibrar', 'Vibrar', 'Faire vibrer', 'Triggers vibration with the selected duration and intensity.', 'Aciona a vibração com a duração e intensidade escolhidas.', 'Activa la vibración con la duración e intensidad elegidas.', 'Déclenche une vibration selon la durée et l’intensité choisies.'],
  ['EVENT_SOUND_STOP', 'Parar sons', 'Detener sonidos', 'Arrêter les sons', 'Stops sound effects in the selected group.', 'Interrompe os efeitos sonoros do grupo selecionado.', 'Detiene los efectos sonoros del grupo seleccionado.', 'Arrête les effets sonores du groupe sélectionné.'],
  ['EVENT_STOP_MUSIC EVENT_MUSIC_STOP', 'Parar música', 'Detener música', 'Arrêter la musique', 'Stops the current music track.', 'Interrompe a música atual.', 'Detiene la música actual.', 'Arrête la musique actuelle.'],
  ['EVENT_SET_MUSIC_VOLUME', 'Definir volume da música', 'Definir volumen de música', 'Définir le volume musical', 'Sets the music playback volume.', 'Define o volume de reprodução da música.', 'Define el volumen de reproducción de la música.', 'Définit le volume de lecture de la musique.'],
  ['EVENT_MUSIC_RESUME', 'Retomar música', 'Reanudar música', 'Reprendre la musique', 'Resumes the paused music track.', 'Retoma a música pausada.', 'Reanuda la música pausada.', 'Reprend la musique suspendue.'],
  ['EVENT_MUSIC_PAUSE', 'Pausar música', 'Pausar música', 'Suspendre la musique', 'Pauses the current music track.', 'Pausa a música atual.', 'Pausa la música actual.', 'Suspend la musique actuelle.'],
  ['EVENT_MUSIC_FADE', 'Alterar volume gradualmente', 'Cambiar volumen gradualmente', 'Modifier progressivement le volume', 'Gradually changes music to the target volume.', 'Altera gradualmente o volume da música até o valor escolhido.', 'Cambia gradualmente el volumen musical hasta el valor elegido.', 'Modifie progressivement la musique jusqu’au volume choisi.'],
  ['EVENT_HBE_EFFECT_ENABLE', 'Ativar efeito H-Blank', 'Activar efecto H-Blank', 'Activer un effet H-Blank', 'Applies a scanline effect to the selected background layer.', 'Aplica um efeito por linha à camada de fundo selecionada.', 'Aplica un efecto por línea a la capa de fondo seleccionada.', 'Applique un effet par ligne au calque de fond sélectionné.'],
  ['EVENT_HBE_EFFECT_DISABLE', 'Desativar efeito H-Blank', 'Desactivar efecto H-Blank', 'Désactiver l’effet H-Blank', 'Removes the active scanline effect.', 'Remove o efeito por linha ativo.', 'Elimina el efecto por línea activo.', 'Retire l’effet par ligne actif.'],
  ['EVENT_BLEND_ALPHA', 'Definir transparência', 'Definir transparencia', 'Définir la transparence', 'Sets the alpha blending level.', 'Define o nível de mistura de transparência.', 'Define el nivel de mezcla de transparencia.', 'Définit le niveau de mélange de transparence.'],
  ['EVENT_SHOOTER_START EVENT_SHOOTER_SPAWN_WAVE', 'Iniciar onda de inimigos', 'Iniciar oleada de enemigos', 'Lancer une vague d’ennemis', 'Starts the selected shooter enemy wave.', 'Inicia a onda de inimigos selecionada do modo de tiro.', 'Inicia la oleada de enemigos seleccionada del modo de disparos.', 'Lance la vague d’ennemis sélectionnée du mode de tir.'],
  ['EVENT_SHOOTER_LOAD_STAGE', 'Carregar fase de tiro', 'Cargar fase de disparos', 'Charger un niveau de tir', 'Loads a shooter wave, music and background together.', 'Carrega uma onda, a música e o fundo do modo de tiro.', 'Carga una oleada, la música y el fondo del modo de disparos.', 'Charge une vague, la musique et le fond du mode de tir.'],
  ['EVENT_SHOOTER_SET_BACKGROUND_MODE', 'Configurar fundo do modo de tiro', 'Configurar fondo del modo de disparos', 'Configurer le fond du mode de tir', 'Sets shooter layer visibility, scrolling and parallax.', 'Configura visibilidade, rolagem e paralaxe do fundo de tiro.', 'Configura visibilidad, desplazamiento y paralaje del fondo de disparos.', 'Configure la visibilité, le défilement et la parallaxe du fond de tir.'],
  ['EVENT_SHOOTER_PAUSE', 'Pausar modo de tiro', 'Pausar modo de disparos', 'Suspendre le mode de tir', 'Pauses or resumes the shooter session.', 'Pausa ou retoma a sessão do modo de tiro.', 'Pausa o reanuda la sesión del modo de disparos.', 'Suspend ou reprend la session du mode de tir.'],
  ['EVENT_SHOOTER_STOP', 'Encerrar modo de tiro', 'Finalizar modo de disparos', 'Terminer le mode de tir', 'Stops the active shooter session.', 'Encerra a sessão ativa do modo de tiro.', 'Finaliza la sesión activa del modo de disparos.', 'Termine la session active du mode de tir.'],
  ['EVENT_SHOOTER_CLEAR_ENEMIES', 'Remover inimigos do modo de tiro', 'Eliminar enemigos del modo de disparos', 'Retirer les ennemis du mode de tir', 'Removes the currently active shooter enemies.', 'Remove os inimigos ativos do modo de tiro.', 'Elimina los enemigos activos del modo de disparos.', 'Retire les ennemis actifs du mode de tir.'],
  ['EVENT_SHOOTER_SPAWN_BOSS', 'Criar chefe', 'Crear jefe', 'Créer un boss', 'Spawns a boss from the selected archetype.', 'Cria um chefe usando o arquétipo selecionado.', 'Crea un jefe usando el arquetipo seleccionado.', 'Crée un boss à partir de l’archétype sélectionné.'],
  ['EVENT_SHOOTER_SET_BOSS_PHASE', 'Definir etapa do chefe', 'Definir fase del jefe', 'Définir la phase du boss', 'Changes the active boss phase.', 'Altera a etapa ativa do chefe.', 'Cambia la fase activa del jefe.', 'Modifie la phase active du boss.'],
  ['EVENT_SHOOTER_WAIT_SIGNAL', 'Aguardar sinal do modo de tiro', 'Esperar señal del modo de disparos', 'Attendre un signal du mode de tir', 'Waits for a shooter signal or the configured timeout.', 'Aguarda um sinal do modo de tiro ou o tempo limite.', 'Espera una señal del modo de disparos o el tiempo límite.', 'Attend un signal du mode de tir ou le délai limite.'],
  ['EVENT_SHOOTER_GRANT', 'Conceder item do modo de tiro', 'Conceder objeto del modo de disparos', 'Accorder un objet du mode de tir', 'Grants the selected shooter reward to the player.', 'Concede ao jogador a recompensa selecionada do modo de tiro.', 'Concede al jugador la recompensa seleccionada del modo de disparos.', 'Accorde au joueur la récompense sélectionnée du mode de tir.'],
  ['EVENT_SHOOTER_SET_STAT', 'Definir atributo do modo de tiro', 'Definir atributo del modo de disparos', 'Définir un attribut du mode de tir', 'Sets a shooter statistic to the chosen value.', 'Define um atributo do modo de tiro com o valor escolhido.', 'Define un atributo del modo de disparos con el valor elegido.', 'Définit un attribut du mode de tir à la valeur choisie.'],
  ['EVENT_SHOOTER_ADD_STAT', 'Somar atributo do modo de tiro', 'Sumar atributo del modo de disparos', 'Ajouter à un attribut du mode de tir', 'Adds a value to a shooter statistic.', 'Soma um valor a um atributo do modo de tiro.', 'Suma un valor a un atributo del modo de disparos.', 'Ajoute une valeur à un attribut du mode de tir.'],
  ['EVENT_SHOOTER_SET_PLAYER_ENABLED', 'Habilitar jogador do modo de tiro', 'Habilitar jugador del modo de disparos', 'Activer le joueur du mode de tir', 'Enables or disables the shooter player.', 'Habilita ou desabilita o jogador do modo de tiro.', 'Habilita o deshabilita al jugador del modo de disparos.', 'Active ou désactive le joueur du mode de tir.'],
  ['EVENT_DISPLAY_DIALOGUE EVENT_DIALOGUE_SHOW', 'Exibir diálogo', 'Mostrar diálogo', 'Afficher un dialogue', 'Shows dialogue with configurable text, frame and portrait.', 'Exibe um diálogo com texto, moldura e retrato configuráveis.', 'Muestra un diálogo con texto, marco y retrato configurables.', 'Affiche un dialogue avec texte, cadre et portrait configurables.'],
  ['EVENT_TEXT_SCROLL', 'Rolar texto', 'Desplazar texto', 'Faire défiler le texte', 'Displays text using the scrolling dialogue presentation.', 'Exibe texto com a apresentação de diálogo em rolagem.', 'Muestra texto con la presentación de diálogo desplazable.', 'Affiche le texte avec la présentation de dialogue défilant.'],
  ['EVENT_SAVE_WRITE', 'Salvar jogo', 'Guardar partida', 'Sauvegarder la partie', 'Saves game data to the selected slot.', 'Salva os dados do jogo no slot selecionado.', 'Guarda los datos del juego en la ranura seleccionada.', 'Sauvegarde les données du jeu dans l’emplacement sélectionné.'],
  ['EVENT_SAVE_LOAD', 'Carregar jogo', 'Cargar partida', 'Charger la partie', 'Restores game data from the selected slot.', 'Restaura os dados do jogo a partir do slot selecionado.', 'Restaura los datos del juego desde la ranura seleccionada.', 'Restaure les données du jeu depuis l’emplacement sélectionné.'],
  ['EVENT_SAVE_REMOVE', 'Excluir jogo salvo', 'Eliminar partida guardada', 'Supprimer la sauvegarde', 'Deletes game data stored in the selected slot.', 'Exclui os dados do jogo armazenados no slot selecionado.', 'Elimina los datos del juego de la ranura seleccionada.', 'Supprime les données du jeu de l’emplacement sélectionné.'],
  ['EVENT_SAVE_ON_LOAD', 'Ao carregar jogo', 'Al cargar partida', 'Au chargement de la partie', 'Runs its events after loading saved game data.', 'Executa seus eventos após carregar os dados salvos do jogo.', 'Ejecuta sus eventos tras cargar los datos guardados del juego.', 'Exécute ses événements après le chargement de la sauvegarde.'],
  ['EVENT_DISPLAY_VARIABLE_TEXT', 'Exibir texto de variável', 'Mostrar texto de variable', 'Afficher le texte d’une variable', 'Displays a variable’s value as text.', 'Exibe o valor de uma variável como texto.', 'Muestra el valor de una variable como texto.', 'Affiche la valeur d’une variable sous forme de texte.'],
  ['EVENT_HIDE_DIALOGUE EVENT_DIALOGUE_CLOSE', 'Fechar diálogo', 'Cerrar diálogo', 'Fermer le dialogue', 'Closes the current dialogue.', 'Fecha o diálogo atual.', 'Cierra el diálogo actual.', 'Ferme le dialogue actuel.'],
  ['EVENT_UI_SET_TEXT', 'Definir texto da interface', 'Definir texto de interfaz', 'Définir le texte de l’interface', 'Creates or updates text at the chosen UI position.', 'Cria ou atualiza um texto na posição escolhida da interface.', 'Crea o actualiza un texto en la posición elegida de la interfaz.', 'Crée ou modifie un texte à la position choisie de l’interface.'],
  ['EVENT_UI_SET_VALUE', 'Definir valor da interface', 'Definir valor de interfaz', 'Définir une valeur de l’interface', 'Shows a label and numeric value in the UI.', 'Exibe um rótulo e um valor numérico na interface.', 'Muestra una etiqueta y un valor numérico en la interfaz.', 'Affiche un libellé et une valeur numérique dans l’interface.'],
  ['EVENT_UI_ANIMATE', 'Animar interface', 'Animar interfaz', 'Animer l’interface', 'Animates the selected UI element.', 'Anima o elemento selecionado da interface.', 'Anima el elemento seleccionado de la interfaz.', 'Anime l’élément sélectionné de l’interface.'],
  ['EVENT_UI_DESTROY', 'Remover elemento da interface', 'Eliminar elemento de interfaz', 'Supprimer un élément de l’interface', 'Destroys the selected UI element.', 'Remove o elemento selecionado da interface.', 'Elimina el elemento seleccionado de la interfaz.', 'Supprime l’élément sélectionné de l’interface.'],
  ['EVENT_UI_HIDE', 'Ocultar elemento da interface', 'Ocultar elemento de interfaz', 'Masquer un élément de l’interface', 'Hides a UI element while preserving it.', 'Oculta um elemento da interface, mantendo-o disponível.', 'Oculta un elemento de interfaz conservándolo.', 'Masque un élément de l’interface en le conservant.'],
  ['EVENT_UI_SHOW', 'Exibir elemento da interface', 'Mostrar elemento de interfaz', 'Afficher un élément de l’interface', 'Shows an existing UI element.', 'Exibe um elemento existente da interface.', 'Muestra un elemento existente de interfaz.', 'Affiche un élément existant de l’interface.'],
  ['EVENT_UI_ANIMATION_STOP', 'Parar animação da interface', 'Detener animación de interfaz', 'Arrêter l’animation de l’interface', 'Stops animation on the selected UI element.', 'Interrompe a animação do elemento selecionado da interface.', 'Detiene la animación del elemento seleccionado de la interfaz.', 'Arrête l’animation de l’élément sélectionné de l’interface.'],
  ['EVENT_SPRITE_EFFECT', 'Aplicar efeito ao sprite', 'Aplicar efecto al sprite', 'Appliquer un effet au sprite', 'Sets an actor’s rotation, scale, visibility or fade effect.', 'Configura rotação, escala, visibilidade ou efeito de cor do ator.', 'Configura rotación, escala, visibilidad o efecto de color del actor.', 'Configure la rotation, l’échelle, la visibilité ou la couleur de l’acteur.'],
  ['EVENT_DIALOGUE_CHOICE EVENT_MENU_OPEN', 'Abrir menu de escolhas', 'Abrir menú de opciones', 'Ouvrir un menu de choix', 'Shows choices and stores the selected option in a variable.', 'Exibe opções e armazena a escolha em uma variável.', 'Muestra opciones y guarda la elección en una variable.', 'Affiche des choix et enregistre la sélection dans une variable.'],
  ['EVENT_CHANGE_LAYER', 'Trocar fundo', 'Cambiar fondo', 'Changer le fond', 'Replaces the image assigned to a background layer.', 'Substitui a imagem atribuída a uma camada de fundo.', 'Sustituye la imagen asignada a una capa de fondo.', 'Remplace l’image affectée à un calque de fond.'],
  ['EVENT_VISIBLE_BACKGROUND', 'Definir visibilidade do fundo', 'Definir visibilidad del fondo', 'Définir la visibilité du fond', 'Shows or hides a background layer.', 'Exibe ou oculta uma camada de fundo.', 'Muestra u oculta una capa de fondo.', 'Affiche ou masque un calque de fond.'],
  ['EVENT_BACKGROUND_SCROLL', 'Rolar fundo', 'Desplazar fondo', 'Faire défiler le fond', 'Sets horizontal and vertical background scrolling.', 'Define a rolagem horizontal e vertical do fundo.', 'Define el desplazamiento horizontal y vertical del fondo.', 'Définit le défilement horizontal et vertical du fond.'],
  ['EVENT_BACKGROUND_SET_PARALLAX', 'Definir paralaxe do fundo', 'Definir paralaje del fondo', 'Définir la parallaxe du fond', 'Sets how a background layer moves with the camera.', 'Define como uma camada de fundo acompanha a câmera.', 'Define cómo una capa de fondo acompaña a la cámara.', 'Définit comment un calque de fond suit la caméra.'],
  ['EVENT_CHANGE_PALETTE_BACKGROUND', 'Trocar paleta do fundo', 'Cambiar paleta del fondo', 'Changer la palette du fond', 'Changes or restores a background layer’s palette.', 'Altera ou restaura a paleta de uma camada de fundo.', 'Cambia o restaura la paleta de una capa de fondo.', 'Modifie ou restaure la palette d’un calque de fond.'],
  ['EVENT_VARIABLE', 'Definir valor da variável', 'Definir valor de variable', 'Définir la valeur d’une variable', 'Assigns a value to the selected variable.', 'Atribui um valor à variável selecionada.', 'Asigna un valor a la variable seleccionada.', 'Affecte une valeur à la variable sélectionnée.'],
  ['EVENT_VARIABLE_RESET_ALL', 'Redefinir todas as variáveis', 'Restablecer todas las variables', 'Réinitialiser toutes les variables', 'Restores all variables to their initial values.', 'Restaura todas as variáveis aos valores iniciais.', 'Restaura todas las variables a sus valores iniciales.', 'Restaure les valeurs initiales de toutes les variables.'],
  ['EVENT_IF', 'Se / senão', 'Si / si no', 'Si / sinon', 'Runs one branch according to a comparison.', 'Executa um dos caminhos conforme uma comparação.', 'Ejecuta una de las ramas según una comparación.', 'Exécute une branche selon une comparaison.'],
  ['EVENT_SWITCH', 'Escolha por valor', 'Elegir según valor', 'Choisir selon une valeur', 'Runs the case matching a value, or the default branch.', 'Executa o caso correspondente ao valor ou o caminho padrão.', 'Ejecuta el caso correspondiente al valor o la rama predeterminada.', 'Exécute le cas correspondant à la valeur ou la branche par défaut.'],
  ['EVENT_SWITCH_CASE', 'Adicionar caso', 'Añadir caso', 'Ajouter un cas', 'Adds a value and its events to a Switch.', 'Adiciona um valor e seus eventos a uma escolha por valor.', 'Añade un valor y sus eventos a una selección por valor.', 'Ajoute une valeur et ses événements à un choix par valeur.'],
  ['EVENT_WHILE', 'Enquanto', 'Mientras', 'Tant que', 'Repeats its events while the comparison remains true.', 'Repete seus eventos enquanto a comparação for verdadeira.', 'Repite sus eventos mientras la comparación sea verdadera.', 'Répète ses événements tant que la comparaison est vraie.'],
  ['EVENT_CALL_SCRIPT', 'Chamar script', 'Llamar script', 'Appeler un script', 'Runs a reusable script with the supplied parameters.', 'Executa um script reutilizável com os parâmetros informados.', 'Ejecuta un script reutilizable con los parámetros indicados.', 'Exécute un script réutilisable avec les paramètres fournis.'],
  ['EVENT_FOR', 'Repetir com contador', 'Repetir con contador', 'Répéter avec un compteur', 'Repeats events while stepping a counter between two values.', 'Repete eventos avançando um contador entre dois valores.', 'Repite eventos incrementando un contador entre dos valores.', 'Répète des événements en faisant avancer un compteur entre deux valeurs.'],
  ['EVENT_BREAK', 'Sair da repetição', 'Salir del bucle', 'Quitter la boucle', 'Exits the current loop.', 'Encerra a repetição atual.', 'Finaliza el bucle actual.', 'Quitte la boucle actuelle.'],
  ['EVENT_CONTINUE', 'Continuar repetição', 'Continuar bucle', 'Continuer la boucle', 'Skips to the next iteration of the current loop.', 'Avança para a próxima passagem da repetição atual.', 'Avanza a la siguiente iteración del bucle actual.', 'Passe à l’itération suivante de la boucle actuelle.'],
  ['EVENT_WAIT_FOR_BUTTON', 'Atribuir script a botão', 'Asignar script a botón', 'Affecter un script à un bouton', 'Assigns events to run when the selected button is pressed.', 'Atribui eventos para executar ao pressionar o botão escolhido.', 'Asigna eventos para ejecutar al pulsar el botón elegido.', 'Affecte des événements à l’appui sur le bouton choisi.'],
  ['EVENT_REMOVE_BUTTON_SCRIPT', 'Remover script do botão', 'Quitar script del botón', 'Retirer le script du bouton', 'Removes the script assigned to the selected button.', 'Remove o script atribuído ao botão selecionado.', 'Quita el script asignado al botón seleccionado.', 'Retire le script affecté au bouton sélectionné.'],
  ['EVENT_PAUSE_UNTIL_BUTTON_PRESSED', 'Aguardar botão pressionado', 'Esperar pulsación de botón', 'Attendre l’appui sur un bouton', 'Pauses this script until a selected button is pressed.', 'Pausa este script até pressionar um dos botões escolhidos.', 'Pausa este script hasta pulsar uno de los botones elegidos.', 'Suspend le script jusqu’à l’appui sur un bouton choisi.'],
  ['EVENT_WAIT_INPUT', 'Aguardar ação de entrada', 'Esperar acción de entrada', 'Attendre une action d’entrée', 'Waits for an input action or the configured timeout.', 'Aguarda uma ação de entrada ou o tempo limite configurado.', 'Espera una acción de entrada o el tiempo límite configurado.', 'Attend une action d’entrée ou le délai limite configuré.'],
  ['EVENT_IF_BUTTON_HELD', 'Se o botão estiver pressionado', 'Si el botón está pulsado', 'Si le bouton est enfoncé', 'Chooses a branch based on whether a button is held.', 'Escolhe um caminho conforme o botão esteja pressionado.', 'Elige una rama según si el botón está pulsado.', 'Choisit une branche selon que le bouton est maintenu enfoncé.'],
  ['EVENT_INPUT_ENABLE', 'Ativar grupo de controles', 'Activar grupo de controles', 'Activer un groupe de commandes', 'Enables the selected input group.', 'Ativa o grupo de controles selecionado.', 'Activa el grupo de controles seleccionado.', 'Active le groupe de commandes sélectionné.'],
  ['EVENT_INPUT_DISABLE', 'Desativar grupo de controles', 'Desactivar grupo de controles', 'Désactiver un groupe de commandes', 'Disables the selected input group.', 'Desativa o grupo de controles selecionado.', 'Desactiva el grupo de controles seleccionado.', 'Désactive le groupe de commandes sélectionné.'],
] as const;

const ui = [
  ['add', 'Add Event', 'Adicionar evento', 'Añadir evento', 'Ajouter un événement'],
  ['search', 'Search events…', 'Buscar eventos…', 'Buscar eventos…', 'Rechercher des événements…'],
  ['favorites', 'Favorites', 'Favoritos', 'Favoritos', 'Favoris'],
  ['categories', 'Categories', 'Categorias', 'Categorías', 'Catégories'],
  ['categoryTitle', '{category} events', 'Funções de {category}', 'Funciones de {category}', 'Événements de {category}'],
  ['favoriteAdd', 'Add {event} to favorites', 'Adicionar {event} aos favoritos', 'Añadir {event} a favoritos', 'Ajouter {event} aux favoris'],
  ['favoriteRemove', 'Remove {event} from favorites', 'Remover {event} dos favoritos', 'Quitar {event} de favoritos', 'Retirer {event} des favoris'],
  ['flow', 'Open Flow Editor', 'Abrir editor de fluxo', 'Abrir editor de flujo', 'Ouvrir l’éditeur de flux'],
  ['category.camera', 'Camera', 'Câmera', 'Cámara', 'Caméra'],
  ['category.scene', 'Scene', 'Cena', 'Escena', 'Scène'],
  ['category.actor', 'Actor', 'Ator', 'Actor', 'Acteur'],
  ['category.save', 'Save Data', 'Dados salvos', 'Datos guardados', 'Données sauvegardées'],
  ['category.screen', 'Screen', 'Tela', 'Pantalla', 'Écran'],
  ['category.ui', 'UI', 'Interface', 'Interfaz', 'Interface'],
  ['category.audio', 'Audio', 'Áudio', 'Audio', 'Audio'],
  ['category.shooter', 'Shooter', 'Modo de tiro', 'Modo de disparos', 'Mode de tir'],
  ['category.dialogue', 'Dialogue', 'Diálogo', 'Diálogo', 'Dialogue'],
  ['category.input', 'Joypad Input', 'Controles', 'Controles', 'Commandes'],
  ['category.timer', 'Timer', 'Temporizador', 'Temporizador', 'Minuterie'],
  ['category.scripts', 'Scripts', 'Scripts', 'Scripts', 'Scripts'],
  ['category.variables', 'Variables', 'Variáveis', 'Variables', 'Variables'],
  ['group.triggers', 'Triggers', 'Triggers', 'Triggers', 'Déclencheurs'],
  ['group.position', 'Position', 'Posição', 'Posición', 'Position'],
  ['group.scene', 'Scene', 'Cena', 'Escena', 'Scène'],
  ['group.backgrounds', 'Background Layers', 'Camadas de fundo', 'Capas de fondo', 'Calques de fond'],
  ['group.physics', 'Physics', 'Física', 'Física', 'Physique'],
  ['group.actors', 'Actor Functions', 'Funções de atores', 'Funciones de actores', 'Fonctions des acteurs'],
  ['group.visibility', 'Visibility', 'Visibilidade', 'Visibilidad', 'Visibilité'],
  ['group.animation', 'Animation', 'Animação', 'Animación', 'Animation'],
  ['group.game', 'Game', 'Jogo', 'Juego', 'Jeu'],
  ['group.hblank', 'H-Blank Effects', 'Efeitos H-Blank', 'Efectos H-Blank', 'Effets H-Blank'],
  ['group.transparency', 'Transparency', 'Transparência', 'Transparencia', 'Transparence'],
  ['group.rumble', 'Rumble', 'Vibra??o', 'Vibraci?n', 'Vibration'],
  ['group.fade', 'Fade', 'Transição', 'Transición', 'Transition'],
  ['group.text', 'Text', 'Texto', 'Texto', 'Texte'],
  ['group.music', 'Music', 'Música', 'Música', 'Musique'],
  ['group.sound', 'Sound', 'Som', 'Sonido', 'Son'],
  ['group.session', 'Session', 'Sessão', 'Sesión', 'Session'],
  ['group.dialogue', 'Dialogue', 'Diálogo', 'Diálogo', 'Dialogue'],
  ['group.menus', 'Menus', 'Menus', 'Menús', 'Menus'],
  ['group.buttons', 'Buttons', 'Botões', 'Botones', 'Boutons'],
  ['group.wait', 'Wait', 'Espera', 'Espera', 'Attente'],
  ['group.script', 'Script', 'Script', 'Script', 'Script'],
  ['group.flow', 'Control Flow', 'Fluxo de execução', 'Flujo de ejecución', 'Flux d’exécution'],
  ['group.assignment', 'Assignment', 'Atribuição', 'Asignación', 'Affectation'],
  ['group.boolean', 'Boolean', 'Booleano', 'Booleano', 'Booléen'],
  ['group.reset', 'Reset', 'Redefinição', 'Restablecimiento', 'Réinitialisation'],
] as const;

// Preserve the separate command names rather than giving related codes the
// same translated label. English labels already differ in the shared catalog.
const distinctLabels = [
  ['EVENT_CAMERA_MOVE_TO', 'Câmera: mover até posição', 'Cámara: mover a posición', 'Caméra : aller à une position'],
  ['EVENT_ACTOR_MOVE_TO', 'Ator: mover até posição', 'Actor: mover a posición', 'Acteur : aller à une position'],
  ['EVENT_ACTOR_SPAWN', 'Ator: surgir na cena', 'Actor: aparecer en la escena', 'Acteur : apparaître dans la scène'],
  ['EVENT_ACTOR_DESPAWN', 'Ator: retirar da cena', 'Actor: retirar de la escena', 'Acteur : retirer de la scène'],
  ['EVENT_ACTOR_SET_VISIBLE', 'Ator: mostrar ou ocultar', 'Actor: mostrar u ocultar', 'Acteur : afficher ou masquer'],
  ['EVENT_MUSIC_STOP', 'Música: interromper reprodução', 'Música: detener reproducción', 'Musique : arrêter la lecture'],
  ['EVENT_SHOOTER_SPAWN_WAVE', 'Criar onda de inimigos', 'Crear oleada de enemigos', 'Créer une vague d’ennemis'],
  ['EVENT_DIALOGUE_SHOW', 'Diálogo: mostrar', 'Diálogo: mostrar', 'Dialogue : afficher'],
  ['EVENT_DIALOGUE_CLOSE', 'Diálogo: encerrar', 'Diálogo: finalizar', 'Dialogue : terminer'],
  ['EVENT_DIALOGUE_CHOICE', 'Diálogo com duas escolhas', 'Diálogo con dos opciones', 'Dialogue à deux choix'],
  ['EVENT_MENU_OPEN', 'Abrir menu de opções', 'Abrir menú de opciones', 'Ouvrir un menu d’options'],
] as const;

const movementPresetLabels = [
  ['EVENT_PAN_CAMERA', 'Move Camera', 'Mover câmera', 'Mover cámara', 'Déplacer la caméra'],
  ['EVENT_CAMERA_MOVE_TO', 'Move Camera with Animation', 'Mover câmera com animação', 'Mover cámara con animación', 'Déplacer la caméra avec animation'],
  ['EVENT_MOVE_ACTOR', 'Move Actor', 'Mover ator', 'Mover actor', 'Déplacer un acteur'],
  ['EVENT_ACTOR_MOVE_TO', 'Move Actor with Animation', 'Mover ator com animação', 'Mover actor con animación', 'Déplacer un acteur avec animation'],
] as const;

export const eventPickerCatalogs: Record<AppLanguage, Record<string, string>> = { en_US: {}, pt_BR: {}, es_ES: {}, fr_FR: {} };
const languages = ['en_US', 'pt_BR', 'es_ES', 'fr_FR'] as const;
for (const [key, ...values] of [
  ['preview', 'Camera central area', 'Área central da câmera', 'Área central de la cámara', 'Zone centrale de la caméra'],
  ['actor', 'Actor', 'Actor', 'Actor', 'Acteur'],
  ['enabled', 'Follow actor', 'Seguir actor', 'Seguir actor', 'Suivre l’acteur'],
  ['persist', 'Persist across scenes', 'Persistir entre cenas', 'Persistir entre escenas', 'Conserver entre les scènes'],
  ['persistHelp', 'Off: camera follow settings reset when changing scenes. On: keep the target, axis locks, central area and scene bounds setting until another Follow event changes them.', 'Desligado: a configuração do Follow é reiniciada ao trocar de cena. Ligado: preserva o alvo, as travas de eixo, a área central e o limite da cena até outro evento Follow alterá-los.', 'Desactivado: Follow se reinicia al cambiar de escena. Activado: conserva el objetivo, los bloqueos de eje, el área central y el límite de escena hasta que otro evento Follow los cambie.', 'Désactivé : le suivi est réinitialisé en changeant de scène. Activé : conserve la cible, les axes verrouillés, la zone centrale et les limites jusqu’au prochain événement Follow.'],
  ['lockX', 'Lock X axis', 'Travar eixo X', 'Bloquear eje X', 'Verrouiller l’axe X'],
  ['lockY', 'Lock Y axis', 'Travar eixo Y', 'Bloquear eje Y', 'Verrouiller l’axe Y'],
  ['lockHelp', 'Each checked axis stays at its current camera position. Unchecked axes follow the actor.', 'Cada eixo marcado permanece na posição atual da câmera. Os eixos desmarcados seguem o ator.', 'Cada eje marcado mantiene la posición actual de la cámara. Los ejes sin marcar siguen al actor.', 'Chaque axe coché conserve sa position actuelle. Les axes non cochés suivent l’acteur.'],
  ['clamp', 'Keep camera inside scene', 'Manter câmera dentro da cena', 'Mantener cámara dentro de la escena', 'Garder la caméra dans la scène'],
  ['width', 'Central area width (px)', 'Largura da área central (px)', 'Ancho del área central (px)', 'Largeur de la zone centrale (px)'],
  ['height', 'Central area height (px)', 'Altura da área central (px)', 'Altura del área central (px)', 'Hauteur de la zone centrale (px)'],
  ['help', 'The camera stays still while the actor moves inside the central area. Zero follows that axis immediately.', 'A câmera fica parada enquanto o actor anda dentro da área central. Zero segue esse eixo imediatamente.', 'La cámara permanece quieta dentro del área central. Cero sigue ese eje inmediatamente.', 'La caméra reste immobile dans la zone centrale. Zéro suit immédiatement cet axe.'],
]) languages.forEach((language, index) => { eventPickerCatalogs[language][`events.cameraFollow.${key}`] = values[index]; });
languages.forEach((language, index) => { eventPickerCatalogs[language]['events.actor.showColliders'] = ['Show actor colliders', 'Mostrar colisores dos actors', 'Mostrar colisiones de los actores', 'Afficher les collisions des acteurs'][index]; });
for (const [key, ...values] of [
  ['title', 'Default palette slots', 'Slots de paleta padrão', 'Slots de paleta predeterminados', 'Emplacements de palette par défaut'],
  ['help', 'All users of a slot update together. Leave empty to use its Settings default.', 'Todos que usam um slot mudam juntos. Deixe vazio para usar o padrão desse slot em Settings.', 'Todos los usuarios de un slot cambian juntos. Déjalo vacío para usar su valor de Settings.', 'Tous les utilisateurs d’un emplacement changent ensemble. Laissez vide pour utiliser sa valeur de Settings.'],
  ['slot', 'Slot', 'Slot', 'Slot', 'Emplacement'],
  ['useDefault', 'Use default palette', 'Usar paleta padrão', 'Usar paleta predeterminada', 'Utiliser la palette par défaut'],
  ['empty', 'No default palette', 'Sem paleta padrão', 'Sin paleta predeterminada', 'Aucune palette par défaut'],
]) languages.forEach((language, index) => { eventPickerCatalogs[language][`events.defaultPalettes.${key}`] = values[index]; });
for (const [codes, pt, es, fr, ...descriptions] of events) for (const code of codes.split(' ')) {
  const english = EVENT_CATALOG.find(event => event.code === code)?.label ?? (code === 'EVENT_SWITCH_CASE' ? 'Add case' : code);
  languages.forEach((language, index) => {
    eventPickerCatalogs[language][`events.${code}`] = [english, pt, es, fr][index];
    eventPickerCatalogs[language][`events.description.${code}`] = descriptions[index];
  });
}
for (const [code, pt, es, fr] of distinctLabels) {
  eventPickerCatalogs.pt_BR[`events.${code}`] = pt;
  eventPickerCatalogs.es_ES[`events.${code}`] = es;
  eventPickerCatalogs.fr_FR[`events.${code}`] = fr;
}
for (const [code, ...labels] of movementPresetLabels) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.picker.label.${code}`] = labels[index];
});
for (const [key, ...values] of ui) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.picker.${key}`] = values[index];
});
const spawnFields = [
  ['removePrefabHint', 'Removes all instances spawned from this prefab in the current scene. Use Self in a prefab script to remove only that instance.', 'Remove todas as instâncias criadas deste prefab na cena atual. Use Este ator no script do prefab para remover apenas aquela instância.', 'Elimina todas las instancias creadas de este prefab en la escena actual. Usa Este actor en el script del prefab para eliminar solo esa instancia.', 'Retire toutes les instances de ce prefab dans la scène actuelle. Utilisez Cet acteur dans le script du prefab pour retirer uniquement cette instance.'],
  ['source', 'Actor source', 'Origem do ator', 'Origen del actor', 'Origine de l’acteur'],
  ['actor', 'Scene actor', 'Ator da cena', 'Actor de la escena', 'Acteur de la scène'],
  ['prefab', 'Actor prefab', 'Prefab de ator', 'Prefab de actor', 'Prefab d’acteur'],
  ['prefabHint', 'Creates an independent copy with the prefab’s sprite, animations and scripts. The GBA shares 128 hardware sprites between actors, the player and UI.', 'Cria uma cópia independente com o sprite, as animações e os scripts do prefab. O GBA compartilha 128 sprites de hardware entre atores, player e interface.', 'Crea una copia independiente con el sprite, las animaciones y los scripts del prefab. El GBA comparte 128 sprites de hardware entre actores, jugador e interfaz.', 'Crée une copie indépendante avec le sprite, les animations et les scripts du prefab. La GBA partage 128 sprites matériels entre les acteurs, le joueur et l’interface.'],
  ['missingPrefab', 'Choose an existing actor prefab.', 'Selecione um prefab de ator existente.', 'Selecciona un prefab de actor existente.', 'Choisissez un prefab d’acteur existant.'],
] as const;
for (const [key, ...values] of spawnFields) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.spawn.${key}`] = values[index];
});
const backgroundTransformFields = [
  ['layer', 'Layer', 'Camada', 'Capa', 'Calque'],
  ['angle', 'Angle (degrees)', 'Ângulo (graus)', 'Ángulo (grados)', 'Angle (degrés)'],
  ['scaleX', 'Scale X (%)', 'Escala X (%)', 'Escala X (%)', 'Échelle X (%)'],
  ['scaleY', 'Scale Y (%)', 'Escala Y (%)', 'Escala Y (%)', 'Échelle Y (%)'],
  ['shearX', 'Shear X (%)', 'Inclinação X (%)', 'Inclinación X (%)', 'Cisaillement X (%)'],
  ['shearY', 'Shear Y (%)', 'Inclinação Y (%)', 'Inclinación Y (%)', 'Cisaillement Y (%)'],
] as const;
for (const [key, ...values] of backgroundTransformFields) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.bgTransform.${key}`] = values[index];
});
const actorVisualFields = [
  ['actor', 'Actor', 'Ator', 'Actor', 'Acteur'],
  ['color', 'Color', 'Cor', 'Color', 'Couleur'],
  ['strength', 'Color overlay (%)', 'Sobreposição de cor (%)', 'Superposición de color (%)', 'Superposition de couleur (%)'],
  ['saturation', 'Saturation (%)', 'Saturação (%)', 'Saturación (%)', 'Saturation (%)'],
  ['brightness', 'Brightness (%)', 'Iluminação (%)', 'Iluminación (%)', 'Luminosité (%)'],
  ['opacity', 'Opacity (%)', 'Opacidade (%)', 'Opacidad (%)', 'Opacité (%)'],
  ['paletteHint', 'Uses the actor’s existing palette. Actors sharing this palette also receive its color effects.', 'Usa a paleta atual do ator. Atores que compartilham essa paleta também recebem os efeitos de cor.', 'Usa la paleta actual del actor. Los actores que comparten esta paleta también reciben los efectos de color.', 'Utilise la palette actuelle de l’acteur. Les acteurs partageant cette palette reçoivent aussi les effets de couleur.'],
  ['opacityHint', '100% is opaque; 0% is transparent. Translucent objects share the last alpha value set because of GBA hardware limits.', '100% é opaco; 0% é transparente. Objetos translúcidos compartilham o último valor alpha definido, por limite do hardware do GBA.', '100% es opaco; 0% es transparente. Los objetos translúcidos comparten el último valor alfa por el límite del hardware de GBA.', '100 % est opaque ; 0 % est transparent. Les objets translucides partagent la dernière valeur alpha selon les limites du GBA.'],
] as const;
for (const [key, ...values] of actorVisualFields) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.visual.${key}`] = values[index];
});

const backgroundCompatibilityFields = [
  ['dimensions', '{scene}, layer {layer}: the complete sheet "{image}" exceeds 16384 pixels in a regular background dimension. Use a bitmap scene for larger sheets.', '{scene}, camada {layer}: a imagem completa "{image}" excede 16384 pixels em uma dimensão de fundo regular. Use uma cena bitmap para imagens maiores.', '{scene}, capa {layer}: la imagen completa "{image}" supera 16384 píxeles en una dimensión de fondo regular. Usa una escena bitmap para imágenes mayores.', '{scene}, calque {layer} : la feuille complète « {image} » dépasse 16384 pixels dans une dimension de fond régulier. Utilisez une scène bitmap pour les feuilles plus grandes.'],
  ['geometry', '{scene}, layer {layer}: the animation frames do not fit "{image}" or its source cannot be read.', '{scene}, camada {layer}: os frames da animação não cabem em "{image}" ou a origem não pôde ser lida.', '{scene}, capa {layer}: los frames no caben en "{image}" o no se pudo leer el origen.', '{scene}, calque {layer} : les images d’animation dépassent « {image} » ou la source est illisible.'],
  ['regularTiles', '{scene}, layer {layer}: the complete image "{image}" needs {count} tiles; regular backgrounds support up to 1024.', '{scene}, camada {layer}: a imagem completa "{image}" precisa de {count} tiles; fundos regulares aceitam até 1024.', '{scene}, capa {layer}: la imagen completa "{image}" necesita {count} tiles; los fondos regulares admiten 1024.', '{scene}, calque {layer} : l’image complète « {image} » nécessite {count} tuiles ; les fonds réguliers en acceptent 1024.'],
  ['compatibleRegular', 'Compatible with a regular layer: {image} ({count}/1024 unique tiles in the complete image).', 'Compatível com camada regular: {image} ({count}/1024 tiles únicos na imagem completa).', 'Compatible con capa regular: {image} ({count}/1024 tiles únicos en la imagen completa).', 'Compatible avec un calque régulier : {image} ({count}/1024 tuiles uniques dans l’image complète).'],
  ['tiles', '{scene}, layer {layer}: "{image}" needs {count} unique tiles; affine backgrounds support up to 256. Simplify the image or use a bitmap scene.', '{scene}, camada {layer}: "{image}" precisa de {count} tiles únicos; fundos affine aceitam até 256. Simplifique a imagem ou use uma cena bitmap.', '{scene}, capa {layer}: "{image}" necesita {count} tiles únicos; los fondos affine admiten hasta 256. Simplifica la imagen o usa una escena bitmap.', '{scene}, calque {layer} : « {image} » nécessite {count} tuiles uniques ; les fonds affine en acceptent 256. Simplifiez l’image ou utilisez une scène bitmap.'],
  ['missing', '{scene}, layer {layer}: no background is available for this transformation.', '{scene}, camada {layer}: não há fundo disponível para essa transformação.', '{scene}, capa {layer}: no hay fondo disponible para esta transformación.', '{scene}, calque {layer} : aucun fond disponible pour cette transformation.'],
  ['unreadable', '{scene}, layer {layer}: could not check "{image}". Check its image, tilesets and animation frames.', '{scene}, camada {layer}: não foi possível verificar "{image}". Confira a imagem, os tilesets e os frames de animação.', '{scene}, capa {layer}: no se pudo verificar "{image}". Revisa la imagen, los tilesets y los frames de animación.', '{scene}, calque {layer} : impossible de vérifier « {image} ». Vérifiez l’image, les tilesets et les images d’animation.'],
  ['layers', '{scene}: this layer combination exceeds the GBA limit. Use one affine layer with up to two regular layers, or two affine layers without regular layers.', '{scene}: esta combinação de camadas excede o limite do GBA. Use uma camada affine com até duas regulares, ou duas affine sem camadas regulares.', '{scene}: esta combinación supera el límite de GBA. Usa una capa affine con hasta dos regulares, o dos affine sin capas regulares.', '{scene} : cette combinaison dépasse la limite du GBA. Utilisez un calque affine et deux réguliers au maximum, ou deux affine sans calques réguliers.'],
  ['compatible', 'Compatible with affine transformations: {image} ({count}/256 unique tiles).', 'Compatível com transformações affine: {image} ({count}/256 tiles únicos).', 'Compatible con transformaciones affine: {image} ({count}/256 tiles únicos).', 'Compatible avec les transformations affine : {image} ({count}/256 tuiles uniques).'],
  ['bitmap', 'Direct bitmap: transformations do not use the 256 affine tile limit.', 'Bitmap direto: as transformações não usam o limite de 256 tiles affine.', 'Bitmap directo: las transformaciones no usan el límite de 256 tiles affine.', 'Bitmap direct : les transformations ne sont pas soumises à la limite de 256 tuiles affine.'],
] as const;
for (const [key, ...values] of backgroundCompatibilityFields) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.bgCompatibility.${key}`] = values[index];
});

const backgroundAnimationFields = [
  ['ticks', 'Ticks', 'Ticks', 'Ticks', 'Ticks'],
  ['seconds', 'Seconds', 'Segundos', 'Segundos', 'Secondes'],
  ['timeUnit', 'Animation time unit', 'Unidade de tempo da animação', 'Unidad de tiempo de animación', 'Unité de temps de l’animation'],
  ['framesUnit', 'Frames', 'Frames', 'Frames', 'Images'],
  ['choosePresets', 'Choose a speed preset', 'Escolher uma velocidade predefinida', 'Elegir una velocidad predefinida', 'Choisir une vitesse prédéfinie'],
  ['speedHelp', 'Duration of each animation frame. Higher values play slower; lower values play faster.', 'Duração de cada frame da animação. Valores maiores animam mais devagar; valores menores animam mais rápido.', 'Duración de cada fotograma. Los valores mayores reproducen más lento; los menores, más rápido.', 'Durée de chaque image. Une valeur plus élevée ralentit la lecture ; une valeur plus faible l’accélère.'],
  ['help.frameWidth', 'Width of one frame in the source image, in pixels.', 'Largura de um frame na imagem de origem, em pixels.', 'Ancho de un frame en la imagen de origen, en píxeles.', 'Largeur d’une image dans la source, en pixels.'],
  ['help.frameHeight', 'Height of one frame in the source image, in pixels.', 'Altura de um frame na imagem de origem, em pixels.', 'Alto de un frame en la imagen de origen, en píxeles.', 'Hauteur d’une image dans la source, en pixels.'],
  ['help.step', 'Distance between the starting positions of consecutive frames. HD defaults to 240 px horizontally or 160 px vertically.', 'Distância entre as posições iniciais de frames consecutivos. Em HD, o padrão é 240 px na horizontal ou 160 px na vertical.', 'Distancia entre las posiciones iniciales de frames consecutivos. En HD, el valor predeterminado es 240 px horizontal o 160 px vertical.', 'Distance entre les positions initiales des images consécutives. En HD, la valeur par défaut est 240 px horizontalement ou 160 px verticalement.'],
  ['help.startFrame', 'First source frame in the selected interval, starting at 1. Both ends are included.', 'Primeiro frame da origem no intervalo selecionado, começando em 1. O início e o fim são incluídos.', 'Primer frame de origen del intervalo, comenzando en 1. Se incluyen ambos extremos.', 'Première image source de l’intervalle, à partir de 1. Les deux bornes sont incluses.'],
  ['help.endFrame', 'Last source frame in the interval. 0 selects the last frame; incomplete edges are padded.', 'Último frame da origem no intervalo. 0 seleciona o último frame; bordas incompletas são preenchidas.', 'Último frame de origen del intervalo. 0 selecciona el último frame; se completan los bordes incompletos.', 'Dernière image source de l’intervalle. 0 sélectionne la dernière image ; les bords incomplets sont complétés.'],
  ['help.reverse', 'Plays the selected interval from its final frame back to its initial frame. Looping preserves this order.', 'Reproduz o intervalo selecionado do frame final para o inicial. O loop mantém essa ordem.', 'Reproduce el intervalo desde el frame final hasta el inicial. El bucle mantiene este orden.', 'Lit l’intervalle sélectionné de la dernière image à la première. La boucle conserve cet ordre.'],
  ['help.loop', 'Repeats the selected interval. When disabled, plays once and holds the final displayed frame.', 'Repete o intervalo selecionado. Desativado, reproduz uma vez e mantém o último frame exibido.', 'Repite el intervalo seleccionado. Desactivado, reproduce una vez y mantiene el último frame mostrado.', 'Répète l’intervalle sélectionné. Sinon, lit une seule fois et conserve la dernière image affichée.'],
  ['startFrame', 'Start frame', 'Frame inicial', 'Frame inicial', 'Première image'],
  ['endFrame', 'End frame (0 = last)', 'Frame final (0 = último)', 'Frame final (0 = último)', 'Dernière image (0 = dernière)'],
  ['reverse', 'Play backwards', 'Reproduzir de trás para frente', 'Reproducir al revés', 'Lire à l’envers'],
  ['rangeHint', 'Frames start at 1. Both ends are included; 0 uses the last frame. Missing pixels are padded without resizing the artwork.', 'Os frames começam em 1. O início e o fim são incluídos; 0 usa o último frame. Áreas faltantes são completadas sem redimensionar a arte.', 'Los frames comienzan en 1. Se incluyen ambos extremos; 0 usa el último frame. Las áreas faltantes se completan sin redimensionar el dibujo.', 'Les images commencent à 1. Les deux bornes sont incluses ; 0 utilise la dernière image. Les pixels manquants sont complétés sans redimensionner le dessin.'],
  ['previewFrame', 'Frame {frame} · {current}/{count}', 'Frame {frame} · {current}/{count}', 'Frame {frame} · {current}/{count}', 'Image {frame} · {current}/{count}'],
  ['regularHint', 'In a regular layer, HD frames are converted to the GBA palette (up to 255 visible colors).', 'Em camada regular, os frames HD são convertidos para a paleta do GBA (até 255 cores visíveis).', 'En una capa regular, los frames HD se convierten a la paleta de GBA (hasta 255 colores visibles).', 'Sur un calque régulier, les images HD sont converties à la palette du GBA (255 couleurs visibles au maximum).'],
  ['image', 'Source image', 'Imagem de origem', 'Imagen de origen', 'Image source'],
  ['normal', 'Normal backgrounds', 'Backgrounds normais', 'Fondos normales', 'Fonds normaux'],
  ['hd', 'HD backgrounds', 'Backgrounds HD', 'Fondos HD', 'Fonds HD'],
  ['direction', 'Frame direction', 'Direção dos frames', 'Dirección de frames', 'Direction des images'],
  ['horizontal', 'Horizontal', 'Horizontal', 'Horizontal', 'Horizontale'],
  ['vertical', 'Vertical', 'Vertical', 'Vertical', 'Verticale'],
  ['frameWidth', 'Frame width (px)', 'Largura do frame (px)', 'Ancho del frame (px)', 'Largeur de l’image (px)'],
  ['frameHeight', 'Frame height (px)', 'Altura do frame (px)', 'Alto del frame (px)', 'Hauteur de l’image (px)'],
  ['step', 'Frame displacement (px)', 'Deslocamento entre frames (px)', 'Desplazamiento entre frames (px)', 'Déplacement entre les images (px)'],
  ['frameCount', 'Frames (0 = all)', 'Frames (0 = todos)', 'Frames (0 = todos)', 'Images (0 = toutes)'],
  ['autoFrames', '0 uses every complete frame that fits the source image.', '0 usa todos os frames completos que cabem na imagem de origem.', '0 usa todos los frames completos que caben en la imagen.', '0 utilise toutes les images complètes contenues dans la source.'],
  ['speed', 'Animation speed', 'Velocidade da animação', 'Velocidad de animación', 'Vitesse d’animation'],
  ['slow', 'Slow (20 frames)', 'Lenta (20 frames)', 'Lenta (20 frames)', 'Lente (20 frames)'],
  ['medium', 'Normal (10 frames)', 'Normal (10 frames)', 'Normal (10 frames)', 'Normale (10 frames)'],
  ['fast', 'Fast (5 frames)', 'Rápida (5 frames)', 'Rápida (5 frames)', 'Rapide (5 frames)'],
  ['custom', 'Custom', 'Personalizada', 'Personalizada', 'Personnalisée'],
  ['durationFrames', 'Ticks per frame', 'Ticks por frame', 'Ticks por frame', 'Ticks par image'],
  ['loop', 'Loop playback', 'Repetir em loop', 'Repetir en bucle', 'Lecture en boucle'],
  ['play', 'Play preview', 'Reproduzir preview', 'Reproducir vista previa', 'Lire l’aperçu'],
  ['pause', 'Pause preview', 'Pausar preview', 'Pausar vista previa', 'Mettre l’aperçu en pause'],
  ['restart', 'Restart preview', 'Reiniciar preview', 'Reiniciar vista previa', 'Redémarrer l’aperçu'],
  ['frames', '{count} frames', '{count} frames', '{count} frames', '{count} images'],
  ['invalid', 'The frame size, displacement or count does not fit the source image.', 'O tamanho, o deslocamento ou a quantidade de frames não cabe na imagem de origem.', 'El tamaño, desplazamiento o número de frames no cabe en la imagen.', 'La taille, le déplacement ou le nombre d’images dépasse la source.'],
  ['preview', 'Background animation preview', 'Preview da animação de fundo', 'Vista previa de animación de fondo', 'Aperçu de l’animation du fond'],
] as const;
for (const [key, ...values] of backgroundAnimationFields) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.bgAnimation.${key}`] = values[index];
});

const waitFields = [
  ['duration', 'Duration', 'Duração', 'Duración', 'Durée'],
  ['unit', 'Wait time unit', 'Unidade de tempo da espera', 'Unidad de tiempo de espera', 'Unité de temps de l’attente'],
  ['frames', 'Frames', 'Frames', 'Frames', 'Images'],
  ['unitsHelp', 'Choose seconds or frames. 60 frames are approximately one second.', 'Escolha segundos ou frames. 60 frames equivalem a aproximadamente um segundo.', 'Elige segundos o frames. 60 frames equivalen aproximadamente a un segundo.', 'Choisissez des secondes ou des images. 60 images font environ une seconde.'],
  ['secondsHelp', 'Time to wait in seconds.', 'Tempo de espera em segundos.', 'Tiempo de espera en segundos.', 'Durée d’attente en secondes.'],
  ['ticksHelp', 'Number of game frames to wait.', 'Quantidade de frames do jogo a aguardar.', 'Número de frames del juego que esperar.', 'Nombre d’images du jeu à attendre.'],
  ['titleTime', 'For {value} Seconds', 'Por {value} segundos', 'Durante {value} segundos', 'Pendant {value} secondes'],
  ['titleFrames', 'For {value} Frames', 'Por {value} frames', 'Durante {value} frames', 'Pendant {value} images'],
  ['titleTicks', 'For {value} Ticks', 'Por {value} ticks', 'Durante {value} ticks', 'Pendant {value} ticks'],
] as const;

const rumbleFields = [
  ['hardwareHint', 'Rumble activates a compatible cartridge motor. To shake the image, use Camera: Shake.', 'Rumble aciona o motor de um cartucho compatível. Para tremer a imagem, use Câmera: Tremer.', 'Rumble activa el motor de un cartucho compatible. Para sacudir la imagen, usa Cámara: Sacudir.', 'Rumble active le moteur d’une cartouche compatible. Pour secouer l’image, utilisez Caméra : Secouer.'],
  ['duration', 'Duration', 'Duração', 'Duración', 'Durée'],
  ['unit', 'Rumble time unit', 'Unidade de tempo da vibração', 'Unidad de tiempo de vibración', 'Unité de temps de vibration'],
  ['durationHelp', 'Vibration duration, up to 120 frames (2 seconds).', 'Duração da vibração, até 120 frames (2 segundos).', 'Duración de la vibración, hasta 120 frames (2 segundos).', 'Durée de vibration, jusqu’à 120 images (2 secondes).'],
  ['intensity', 'Intensity (%)', 'Intensidade (%)', 'Intensidad (%)', 'Intensité (%)'],
  ['intensityHelp', 'Vibration strength from 0 to 100%.', 'Força da vibração de 0 a 100%.', 'Fuerza de vibración de 0 a 100%.', 'Force de vibration de 0 à 100 %.'],
] as const;

const shakeFields = [
  ['mode', 'Shake mode', 'Modo de tremor', 'Modo de sacudida', 'Mode de secousse'],
  ['default', 'Default', 'Padrão', 'Predeterminado', 'Par défaut'],
  ['custom', 'Custom', 'Personalizado', 'Personalizado', 'Personnalisé'],
  ['axis', 'Direction', 'Direção', 'Dirección', 'Direction'],
  ['both', 'Both', 'Ambas', 'Ambas', 'Les deux'],
  ['horizontal', 'Horizontal', 'Horizontal', 'Horizontal', 'Horizontale'],
  ['vertical', 'Vertical', 'Vertical', 'Vertical', 'Verticale'],
  ['amplitude', 'Intensity (px)', 'Intensidade (px)', 'Intensidad (px)', 'Intensité (px)'],
  ['amplitudeHelp', 'Displacement from 1 to 8 pixels on each selected axis.', 'Deslocamento de 1 a 8 pixels em cada eixo selecionado.', 'Desplazamiento de 1 a 8 píxeles en cada eje seleccionado.', 'Déplacement de 1 à 8 pixels sur chaque axe sélectionné.'],
  ['duration', 'Duration (frames)', 'Duração (frames)', 'Duración (frames)', 'Durée (images)'],
  ['durationHelp', 'From 1 to 120 frames, up to 2 seconds. The camera returns to its original position afterwards.', 'De 1 a 120 frames, até 2 segundos. Ao terminar, a câmera volta à posição original.', 'De 1 a 120 frames, hasta 2 segundos. Al terminar, la cámara vuelve a su posición original.', 'De 1 à 120 images, jusqu’à 2 secondes. La caméra revient ensuite à sa position initiale.'],
  ['defaultHint', '2 pixels on both axes for 8 frames.', '2 pixels nos dois eixos por 8 frames.', '2 píxeles en ambos ejes durante 8 frames.', '2 pixels sur les deux axes pendant 8 images.'],
] as const;
shakeFields.forEach(([key, ...values]) => {
  (['en_US', 'pt_BR', 'es_ES', 'fr_FR'] as const).forEach((language, index) => {
    eventPickerCatalogs[language][`events.shake.${key}`] = values[index];
  });
});
rumbleFields.forEach(([key, ...values]) => {
  (['en_US', 'pt_BR', 'es_ES', 'fr_FR'] as const).forEach((language, index) => {
    eventPickerCatalogs[language][`events.rumble.${key}`] = values[index];
  });
});
for (const [key, ...values] of waitFields) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.wait.${key}`] = values[index];
});

const actorTransformFields = [
  ['rotation', 'Rotation (degrees)', 'Rotação (graus)', 'Rotación (grados)', 'Rotation (degrés)'],
  ['scale', 'Scale (%)', 'Escala (%)', 'Escala (%)', 'Échelle (%)'],
  ['duration', 'Duration (frames)', 'Duração (frames)', 'Duración (frames)', 'Durée (frames)'],
  ['hint', 'Changes only this visual property. One frame applies immediately; longer durations animate independently. The collider is unchanged.', 'Altera apenas esta propriedade visual. Um frame aplica imediatamente; durações maiores animam independentemente. O colisor permanece igual.', 'Cambia solo esta propiedad visual. Un frame aplica inmediatamente; duraciones mayores animan independientemente. El colisionador no cambia.', 'Modifie seulement cette propriété visuelle. Une frame applique immédiatement ; les durées plus longues animent indépendamment. La collision ne change pas.'],
] as const;
for (const [key, ...values] of actorTransformFields) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.transform.${key}`] = values[index];
});

const triggerStateFields = [
  ['target', 'Trigger', 'Trigger', 'Trigger', 'Déclencheur'],
  ['enabled', 'Enabled', 'Habilitado', 'Habilitado', 'Activé'],
  ['hint', 'Changes the trigger in the current scene. Disabling prevents new activations; a running script finishes. Enabling preserves once and cooldown settings.', 'Altera o trigger da cena atual. Desativar impede novas ativações; um script em execução continua até terminar. Ativar preserva as configurações de execução única e intervalo.', 'Cambia el trigger de la escena actual. Desactivar impide nuevas activaciones; un script en ejecución termina. Activar conserva las opciones de una sola ejecución e intervalo.', 'Modifie le déclencheur de la scène actuelle. Désactiver empêche les nouvelles activations ; un script en cours se termine. Activer conserve les réglages d’exécution unique et de délai.'],
] as const;
for (const [key, ...values] of triggerStateFields) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.triggerState.${key}`] = values[index];
});

for (const [key, ...values] of [["singleSettingHint", "Changes only this physics setting and preserves the other values.", "Altera apenas esta configura\u00e7\u00e3o de f\u00edsica e preserva os outros valores.", "Cambia solo esta propiedad f\u00edsica y conserva los dem\u00e1s valores.", "Modifie uniquement ce param\u00e8tre physique et conserve les autres valeurs."], ["resetHint", "Restores the default physics settings. For an actor, also disables its custom physics.", "Restaura os valores padr\u00e3o de f\u00edsica. Em um ator, tamb\u00e9m desativa a f\u00edsica personalizada.", "Restaura los valores predeterminados de f\u00edsica. En un actor, tambi\u00e9n desactiva su f\u00edsica personalizada.", "Restaure les param\u00e8tres physiques par d\u00e9faut. Pour un acteur, d\u00e9sactive aussi sa physique personnalis\u00e9e."]] as const) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.physics.${key}`] = values[index];
});

const splitPhysicsLabels = [["EVENT_PHYSICS_SET_GRAVITY", "Set Gravity", "Definir gravidade", "Definir gravedad", "D\u00e9finir la gravit\u00e9"], ["EVENT_PHYSICS_SET_JUMP_SPEED", "Set Jump Speed", "Definir velocidade do pulo", "Definir velocidad de salto", "D\u00e9finir la vitesse de saut"], ["EVENT_PHYSICS_SET_MAX_FALL_SPEED", "Set Maximum Fall Speed", "Definir velocidade m\u00e1xima de queda", "Definir velocidad m\u00e1xima de ca\u00edda", "D\u00e9finir la vitesse maximale de chute"], ["EVENT_PHYSICS_SET_AIR_JUMPS", "Set Air Jumps", "Definir pulos no ar", "Definir saltos en el aire", "D\u00e9finir les sauts en l\u2019air"], ["EVENT_PHYSICS_SET_DIAGONAL", "Set Diagonal Movement", "Definir movimento diagonal", "Definir movimiento diagonal", "D\u00e9finir le mouvement diagonal"], ["EVENT_PHYSICS_RESET", "Reset Physics", "Restaurar f\u00edsica", "Restablecer f\u00edsica", "R\u00e9initialiser la physique"]] as const;
for (const [code, ...values] of splitPhysicsLabels) languages.forEach((language, index) => {
  eventPickerCatalogs[language][`events.${code}`] = values[index];
  eventPickerCatalogs[language][`events.description.${code}`] = values[index] + '. ' + eventPickerCatalogs[language][code === 'EVENT_PHYSICS_RESET' ? 'events.physics.resetHint' : 'events.physics.singleSettingHint'];
});
