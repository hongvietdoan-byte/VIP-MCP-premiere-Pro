// premiere-tools.js — General-purpose Premiere Pro tools via Beat Shake MCP bridge
// Groups: Project/File, Timeline Editing, Voice Cleanup, FX Console, Audio Mixing,
//         Transitions, Color Grading, Captions, Clip Speed, Bin Management,
//         Selection, Scene Detection, Metadata, MOGRT, Export, AI Transcription

export const PREMIERE_TOOLS = [

  // ==========================================================================
  // GROUP 1 — Project & File
  // ==========================================================================
  {
    name: 'get_project_info',
    description: 'Lấy thông tin project Premiere đang mở: tên, đường dẫn, danh sách sequence, danh sách bin.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_project_info', {}, 15000);
    }
  },

  {
    name: 'import_files',
    description: 'Import file vào Project panel của Premiere Pro. Hỗ trợ video, audio, ảnh, subtitle, MOGRT. Tùy chọn chỉ định bin đích. Trả về danh sách file đã import thành công và file bị bỏ qua (đã tồn tại hoặc lỗi).',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          description: 'Mảng đường dẫn tuyệt đối đến file cần import, ví dụ ["C:\\\\Users\\\\NC\\\\video.mp4"].',
          items: { type: 'string' }
        },
        binName: {
          type: 'string',
          description: 'Tên bin đích trong Project panel. Để trống thì import vào root của project.'
        }
      },
      required: ['paths']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('import_files', { paths: args.paths, binName: args.binName }, 30000);
    }
  },

  {
    name: 'open_project',
    description: 'Mở file project Premiere (.prproj) từ đường dẫn chỉ định. Premiere sẽ đóng project hiện tại trước khi mở cái mới.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối đến file .prproj.' }
      },
      required: ['path']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('open_project', { path: args.path }, 30000);
    }
  },

  // ==========================================================================
  // GROUP 2 — Timeline Editing
  // ==========================================================================
  {
    name: 'cut_clip_at_time',
    description: 'Cắt (razor) tất cả clip trên timeline tại thời điểm chỉ định. Mặc định cắt tại vị trí CTI (playhead) hiện tại. Yêu cầu QE DOM — nếu không có sẽ báo lỗi rõ.',
    inputSchema: {
      type: 'object',
      properties: {
        timeSeconds: {
          type: 'number',
          description: 'Thời điểm cắt tính bằng giây. Bỏ trống = dùng vị trí CTI hiện tại.'
        },
        trackType: {
          type: 'string',
          description: '"video" | "audio" | "all" (mặc định "all"). Chỉ cắt track thuộc loại này.',
          enum: ['video', 'audio', 'all']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('cut_clip_at_time', {
        timeSeconds: args.timeSeconds,
        trackType: args.trackType ?? 'all'
      }, 20000);
    }
  },

  {
    name: 'trim_clip',
    description: 'Chỉnh in-point hoặc out-point của clip đang chọn trên timeline. Truyền inSeconds, outSeconds, hoặc cả hai. Thời gian tính theo sequence time (giây từ đầu sequence).',
    inputSchema: {
      type: 'object',
      properties: {
        inSeconds: {
          type: 'number',
          description: 'In-point mới của clip (giây theo sequence time). Bỏ trống = giữ nguyên in-point hiện tại.'
        },
        outSeconds: {
          type: 'number',
          description: 'Out-point mới của clip (giây theo sequence time). Bỏ trống = giữ nguyên out-point hiện tại.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('trim_clip', { inSeconds: args.inSeconds, outSeconds: args.outSeconds }, 20000);
    }
  },

  {
    name: 'delete_clip',
    description: 'Xóa clip đang chọn khỏi timeline. Ripple=false (mặc định): xóa và để gap. Ripple=true: xóa và kéo các clip sau sang trái để lấp gap.',
    inputSchema: {
      type: 'object',
      properties: {
        ripple: {
          type: 'boolean',
          description: 'true = ripple delete (lấp gap), false = chỉ xóa clip (mặc định false).'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('delete_clip', { ripple: args.ripple === true }, 20000);
    }
  },

  {
    name: 'ripple_delete',
    description: 'Xóa khoảng trống (gap) trên timeline trong một khoảng thời gian chỉ định, đồng thời kéo tất cả clip sau đó sang trái để lấp đầy. Ưu tiên dùng QE DOM, fallback về manual shift. CRITICAL: Nếu xử lý nhiều vùng, plugin tự động làm từ cuối về đầu để timestamp không lệch.',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: {
          type: 'number',
          description: 'Bắt đầu vùng cần xóa (giây). Bỏ trống = dùng in-point clip đang chọn.'
        },
        endSeconds: {
          type: 'number',
          description: 'Kết thúc vùng cần xóa (giây). Bỏ trống = dùng out-point clip đang chọn.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('ripple_delete', {
        startSeconds: args.startSeconds,
        endSeconds: args.endSeconds
      }, 30000);
    }
  },

  {
    name: 'move_clip',
    description: 'Di chuyển clip đang chọn đến vị trí thời gian mới trên timeline. Truyền startSeconds để set thời điểm bắt đầu mới, tùy chọn trackIndex để đổi track.',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: {
          type: 'number',
          description: 'Thời điểm bắt đầu mới của clip (giây theo sequence time).'
        },
        trackIndex: {
          type: 'number',
          description: 'Index của track đích (0-based). Bỏ trống = giữ nguyên track hiện tại.'
        }
      },
      required: ['startSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('move_clip', {
        startSeconds: args.startSeconds,
        trackIndex: args.trackIndex
      }, 20000);
    }
  },

  // ==========================================================================
  // GROUP 3 — Voice Cleanup
  // ==========================================================================
  {
    name: 'detect_silence_regions',
    description: 'Phân tích clip audio đang chọn, tìm các vùng im lặng (dưới ngưỡng dB) có thời lượng tối thiểu. Chỉ đọc, không thay đổi timeline. Dùng để preview trước khi xóa.',
    inputSchema: {
      type: 'object',
      properties: {
        thresholdDb: {
          type: 'number',
          description: 'Ngưỡng biên độ (dBFS). Vùng dưới ngưỡng này được coi là im lặng. Mặc định -40 dBFS.'
        },
        minDurationMs: {
          type: 'number',
          description: 'Thời lượng tối thiểu của vùng im lặng tính bằng mili-giây. Mặc định 300ms — lọc bỏ những khoảng ngắt hơi ngắn.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('detect_silence_regions', {
        thresholdDb: args.thresholdDb ?? -40,
        minDurationMs: args.minDurationMs ?? 300
      }, 60000);
    }
  },

  {
    name: 'remove_silence_gaps',
    description: 'Dọn dẹp voice clip: tìm vùng im lặng rồi cắt và ripple delete để loại bỏ khoảng trống. autoApply=false (mặc định) chỉ trả về danh sách vùng sẽ bị xóa để review. autoApply=true thực hiện cắt thật — không thể undo tự động.',
    inputSchema: {
      type: 'object',
      properties: {
        thresholdDb: {
          type: 'number',
          description: 'Ngưỡng im lặng dBFS. Mặc định -40.'
        },
        minDurationMs: {
          type: 'number',
          description: 'Thời lượng tối thiểu vùng im lặng cần xóa (ms). Mặc định 300.'
        },
        autoApply: {
          type: 'boolean',
          description: 'false (mặc định): chỉ trả preview danh sách vùng silence. true: thực sự cắt và ripple delete. Luôn preview trước, xác nhận với user rồi mới autoApply=true.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_silence_gaps', {
        thresholdDb: args.thresholdDb ?? -40,
        minDurationMs: args.minDurationMs ?? 300,
        autoApply: args.autoApply === true
      }, 120000);
    }
  },

  // ==========================================================================
  // GROUP 4 — FX Console: Effect Search & Apply
  // ==========================================================================
  {
    name: 'search_effects',
    description: 'Tìm kiếm effect Premiere Pro theo tên hoặc từ khóa. Trả về displayName, matchName (dùng để apply), và category. Nếu Premiere đang mở và plugin đã nối, ưu tiên danh sách THẬT trên máy (kể cả effect bên thứ 3); nếu không, rơi về database offline ~250 effects chuẩn ADBE.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Từ khóa tìm kiếm, ví dụ "blur", "color", "gaussian", "lumetri". Không phân biệt hoa thường.'
        },
        limit: {
          type: 'number',
          description: 'Số kết quả tối đa trả về. Mặc định 20.',
          minimum: 1,
          maximum: 100
        }
      },
      required: ['query']
    },
    async execute(wsBridge, args) {
      const { EFFECTS_DB } = await import('../data/premiere-effects.js');
      const q = (args.query ?? '').toLowerCase();

      // Ưu tiên danh sách THẬT của máy đang chạy (qua plugin, kể cả effect bên thứ 3) —
      // database tĩnh chỉ dùng làm fallback khi Premiere chưa mở, hoặc để có category đẹp
      // cho các effect chuẩn ADBE mà QE DOM không phân loại.
      let source = EFFECTS_DB;
      if (wsBridge.isConnected()) {
        try {
          const live = await wsBridge.sendCommand('list_installed_effects', {}, 15000);
          if (live?.effects?.length) {
            const staticByName = new Map(EFFECTS_DB.map(e => [e.displayName.toLowerCase(), e]));
            source = live.effects.map(e => staticByName.get(e.displayName.toLowerCase()) ?? e);
          }
        } catch { /* plugin không phản hồi kịp -- rơi về database tĩnh, không chặn tool */ }
      }

      const results = source.filter(e =>
        e.displayName.toLowerCase().includes(q) ||
        e.matchName.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      ).slice(0, args.limit ?? 20);
      return { effects: results, total: results.length, query: args.query, source: source === EFFECTS_DB ? 'static' : 'live' };
    }
  },

  {
    name: 'apply_effect',
    description: 'Áp dụng effect lên clip đang chọn trong Premiere Pro. Dùng matchName từ search_effects để chỉ định chính xác effect. Trả về componentIndex của effect vừa thêm để dùng với set_effect_param.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: {
          type: 'string',
          description: 'FilterMatchName của effect, ví dụ "ADBE Gaussian Blur 2", "ADBE Fast Color Corrector". Dùng search_effects để tìm matchName đúng.'
        }
      },
      required: ['matchName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('apply_effect', { matchName: args.matchName }, 20000);
    }
  },

  {
    name: 'get_clip_effects',
    description: 'Lấy danh sách effect đang có trên clip đang chọn: displayName, matchName, enabled/disabled, số parameter. Dùng để biết matchName chính xác trước khi gọi set_effect_param hoặc remove_effect.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_clip_effects', {}, 15000);
    }
  },

  {
    name: 'set_effect_param',
    description: 'Set giá trị parameter của effect trên clip đang chọn. Nếu truyền timeSeconds thì đặt keyframe, không truyền thì set static value. Dùng get_clip_effects để lấy matchName đúng.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: {
          type: 'string',
          description: 'FilterMatchName của effect trên clip (lấy từ get_clip_effects).'
        },
        paramName: {
          type: 'string',
          description: 'Tên hiển thị của parameter, ví dụ "Blurriness", "Exposure", "Saturation".'
        },
        value: {
          description: 'Giá trị mới (number hoặc string tùy param).'
        },
        timeSeconds: {
          type: 'number',
          description: 'Thời điểm đặt keyframe (giây theo sequence time). Bỏ trống = set static không keyframe.'
        }
      },
      required: ['matchName', 'paramName', 'value']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_effect_param', {
        matchName: args.matchName,
        paramName: args.paramName,
        value: args.value,
        timeSeconds: args.timeSeconds
      }, 20000);
    }
  },

  {
    name: 'remove_effect',
    description: 'Xóa effect khỏi clip đang chọn theo matchName. Dùng get_clip_effects để xem danh sách effect hiện có.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: {
          type: 'string',
          description: 'FilterMatchName của effect cần xóa (lấy từ get_clip_effects).'
        }
      },
      required: ['matchName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_effect', { matchName: args.matchName }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 5 — Audio Mixing
  // ==========================================================================
  {
    name: 'set_clip_volume',
    description: 'Điều chỉnh âm lượng clip audio đang chọn theo đơn vị dBFS. 0 dB = giữ nguyên, -6 dB = giảm nửa, +6 dB = tăng gấp đôi.',
    inputSchema: {
      type: 'object',
      properties: {
        gainDb: {
          type: 'number',
          description: 'Giá trị gain tính bằng dB (-60 đến +15). 0 = không đổi.'
        }
      },
      required: ['gainDb']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_volume', { gainDb: args.gainDb }, 15000);
    }
  },

  {
    name: 'set_clip_pan',
    description: 'Điều chỉnh pan (trái-phải) của clip audio đang chọn. -100 = hoàn toàn trái, 0 = center, +100 = hoàn toàn phải.',
    inputSchema: {
      type: 'object',
      properties: {
        panValue: {
          type: 'number',
          description: 'Giá trị pan (-100 đến +100). 0 = center.',
          minimum: -100,
          maximum: 100
        }
      },
      required: ['panValue']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_pan', { panValue: args.panValue }, 15000);
    }
  },

  {
    name: 'mute_track',
    description: 'Mute hoặc unmute một audio track theo trackIndex trong sequence đang active.',
    inputSchema: {
      type: 'object',
      properties: {
        trackIndex: {
          type: 'number',
          description: 'Index của audio track (0-based).'
        },
        muted: {
          type: 'boolean',
          description: 'true = mute, false = unmute.'
        }
      },
      required: ['trackIndex', 'muted']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('mute_track', { trackIndex: args.trackIndex, muted: args.muted }, 10000);
    }
  },

  {
    name: 'setup_audio_ducking',
    description: 'Thiết lập audio ducking: tự động giảm âm lượng nhạc nền khi có voice. Thêm keyframes vào music track để giảm dB tại các đoạn voice active.',
    inputSchema: {
      type: 'object',
      properties: {
        musicTrackIndex: {
          type: 'number',
          description: 'Index của track nhạc nền (0-based).'
        },
        voiceTrackIndex: {
          type: 'number',
          description: 'Index của track voice (0-based).'
        },
        duckDb: {
          type: 'number',
          description: 'Mức giảm âm lượng tính bằng dB khi voice active. Mặc định -12 dB.'
        }
      },
      required: ['musicTrackIndex', 'voiceTrackIndex']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('setup_audio_ducking', {
        musicTrackIndex: args.musicTrackIndex,
        voiceTrackIndex: args.voiceTrackIndex,
        duckDb: args.duckDb ?? -12
      }, 30000);
    }
  },

  // ==========================================================================
  // GROUP 6 — Transitions
  // ==========================================================================
  {
    name: 'list_available_transitions',
    description: 'Lấy danh sách transition có sẵn trong Premiere Pro từ effect database offline: video transitions, audio transitions, hoặc tất cả.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '"video" | "audio" | "all" (mặc định). Lọc theo loại transition.',
          enum: ['video', 'audio', 'all']
        }
      },
      required: []
    },
    async execute(wsBridge, args) {
      const { EFFECTS_DB } = await import('../data/premiere-effects.js');
      const typeFilter = args.type ?? 'all';

      // TransitionFactory.getVideoTransitionMatchNames() chỉ trả VIDEO transition (không có API
      // live cho audio transition — đã xác nhận qua nghiên cứu, AudioFilterFactory không có hàm
      // tương đương) — audio transitions LUÔN lấy từ database tĩnh. Video transition: merge qua
      // matchName với database tĩnh để có category đẹp khi trùng, giữ nguyên matchName thật để apply.
      const staticAudio = EFFECTS_DB.filter(e => e.isTransition && e.category.toLowerCase().includes('audio'));
      let videoSource = EFFECTS_DB.filter(e => e.isTransition && e.category.toLowerCase().includes('video'));
      if (wsBridge.isConnected()) {
        try {
          const live = await wsBridge.sendCommand('list_installed_transitions', {}, 15000);
          if (live?.transitions?.length) {
            const staticByMatchName = new Map(videoSource.map(e => [e.matchName.toLowerCase(), e]));
            videoSource = live.transitions.map(t => staticByMatchName.get(t.matchName.toLowerCase()) ?? t);
          }
        } catch { /* rơi về database tĩnh */ }
      }
      const source = [...videoSource, ...staticAudio];

      const transitions = source.filter(e => {
        if (!e.isTransition) return false;
        if (typeFilter === 'video') return e.category.toLowerCase().includes('video');
        if (typeFilter === 'audio') return e.category.toLowerCase().includes('audio');
        return true;
      });
      return { transitions, total: transitions.length };
    }
  },

  {
    name: 'add_transition',
    description: 'Thêm transition vào đầu, cuối, hoặc cả hai đầu của clip đang chọn. Mặc định dùng Cross Dissolve.',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          description: '"start" | "end" | "both" — vị trí thêm transition.',
          enum: ['start', 'end', 'both']
        },
        matchName: {
          type: 'string',
          description: 'FilterMatchName của transition. Mặc định "ADBE Cross Dissolve". Dùng list_available_transitions để xem các option khác.'
        },
        durationFrames: {
          type: 'number',
          description: 'Thời lượng transition tính bằng frame. Mặc định 15 frame.'
        }
      },
      required: ['position']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('add_transition', {
        position: args.position,
        matchName: args.matchName ?? 'ADBE Cross Dissolve',
        durationFrames: args.durationFrames ?? 15
      }, 20000);
    }
  },

  {
    name: 'batch_add_transitions',
    description: 'Thêm cùng một transition vào TẤT CẢ clip đang được chọn. Tiết kiệm thời gian khi cần transition đồng nhất.',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          description: '"start" | "end" | "both".',
          enum: ['start', 'end', 'both']
        },
        matchName: {
          type: 'string',
          description: 'FilterMatchName của transition. Mặc định "ADBE Cross Dissolve".'
        },
        durationFrames: {
          type: 'number',
          description: 'Thời lượng (frame). Mặc định 15.'
        }
      },
      required: ['position']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('batch_add_transitions', {
        position: args.position,
        matchName: args.matchName ?? 'ADBE Cross Dissolve',
        durationFrames: args.durationFrames ?? 15
      }, 60000);
    }
  },

  // ==========================================================================
  // GROUP 7 — Color Grading
  // ==========================================================================
  {
    name: 'apply_lumetri_preset',
    description: 'Áp dụng preset màu Lumetri Color lên clip đang chọn. Có thể truyền tên preset built-in (Kodak, Fuji, Cinema...) hoặc đường dẫn file .cube / .look.',
    inputSchema: {
      type: 'object',
      properties: {
        presetName: {
          type: 'string',
          description: 'Tên preset Lumetri built-in, ví dụ "Kodak 5218 Kodak 2383", "SL Big & Bright". Hoặc để trống nếu chỉ dùng inputCubePath.'
        },
        inputCubePath: {
          type: 'string',
          description: 'Đường dẫn tuyệt đối đến file .cube hoặc .look để import như LUT.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('apply_lumetri_preset', {
        presetName: args.presetName,
        inputCubePath: args.inputCubePath
      }, 20000);
    }
  },

  {
    name: 'set_clip_color_label',
    description: 'Đặt màu label cho clip trong timeline/project panel, dùng để phân loại. Ví dụ: video = iris, music = mango, voice = rose.',
    inputSchema: {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          description: 'Màu label: "violet" | "iris" | "caribbean" | "lavender" | "cerulean" | "forest" | "rose" | "mango" | "none".',
          enum: ['violet', 'iris', 'caribbean', 'lavender', 'cerulean', 'forest', 'rose', 'mango', 'none']
        }
      },
      required: ['color']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_color_label', { color: args.color }, 10000);
    }
  },

  {
    name: 'adjust_color_values',
    description: 'Chỉnh nhanh các thông số màu cơ bản của clip qua Lumetri Color: exposure, contrast, saturation, temperature. Truyền chỉ các thông số cần đổi, bỏ qua phần còn lại.',
    inputSchema: {
      type: 'object',
      properties: {
        exposure: { type: 'number', description: 'Exposure (-5 đến +5). 0 = giữ nguyên.' },
        contrast: { type: 'number', description: 'Contrast (-100 đến +100).' },
        saturation: { type: 'number', description: 'Saturation (0 = grayscale, 100 = bình thường, 200 = siêu bão hòa).' },
        temperature: { type: 'number', description: 'Color temperature (-100 cool/xanh đến +100 warm/vàng).' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('adjust_color_values', {
        exposure: args.exposure,
        contrast: args.contrast,
        saturation: args.saturation,
        temperature: args.temperature
      }, 20000);
    }
  },

  // ==========================================================================
  // GROUP 8 — Captions & Subtitles
  // ==========================================================================
  {
    name: 'create_caption_track',
    description: 'Tạo caption track mới trong sequence đang active. Hỗ trợ format Open Captions, CEA-708, subtitle.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: '"subtitle" (mặc định, Open Captions) | "CEA-708" | "SRT".',
          enum: ['subtitle', 'CEA-708', 'SRT']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('create_caption_track', { format: args.format ?? 'subtitle' }, 15000);
    }
  },

  {
    name: 'import_srt',
    description: 'Import file phụ đề .srt vào Premiere và thêm vào caption track. Premiere 2024+ có thể tự chuyển đổi SRT thành Open Captions.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối đến file .srt.' },
        trackIndex: { type: 'number', description: 'Index caption track đích. Bỏ trống = tạo track mới hoặc dùng track đầu tiên.' }
      },
      required: ['path']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('import_srt', { path: args.path, trackIndex: args.trackIndex }, 20000);
    }
  },

  {
    name: 'read_sequence_captions',
    description: 'Đọc nội dung các caption đang có trên sequence: thời điểm bắt đầu/kết thúc, text. Dùng để review subtitle trước khi export.',
    inputSchema: {
      type: 'object',
      properties: {
        trackIndex: { type: 'number', description: 'Index caption track (0-based). Bỏ trống = đọc track caption đầu tiên.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('read_sequence_captions', { trackIndex: args.trackIndex }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 9 — Clip Speed & Playback
  // ==========================================================================
  {
    name: 'set_clip_speed',
    description: 'Thay đổi tốc độ phát của clip đang chọn. 50 = slow motion 50%, 200 = tăng tốc 2x. Duration clip sẽ thay đổi theo.',
    inputSchema: {
      type: 'object',
      properties: {
        speedPercent: {
          type: 'number',
          description: 'Tốc độ phần trăm (1-800). 100 = bình thường, 50 = chậm 2x, 200 = nhanh 2x.',
          minimum: 1,
          maximum: 800
        }
      },
      required: ['speedPercent']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_speed', { speedPercent: args.speedPercent }, 15000);
    }
  },

  {
    name: 'reverse_clip',
    description: 'Đảo ngược hướng phát (reverse) clip đang chọn. Clip sẽ chạy từ cuối về đầu.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('reverse_clip', {}, 15000);
    }
  },

  {
    name: 'freeze_frame',
    description: 'Đóng băng frame tại một thời điểm chỉ định trên clip đang chọn. Phần còn lại của clip sẽ hiển thị frame đó tĩnh. Yêu cầu QE DOM.',
    inputSchema: {
      type: 'object',
      properties: {
        atSeconds: { type: 'number', description: 'Thời điểm frame cần đóng băng (giây theo sequence time). Bỏ trống = frame tại CTI hiện tại.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('freeze_frame', { atSeconds: args.atSeconds }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 10 — Media & Bin Management
  // ==========================================================================
  {
    name: 'create_bin',
    description: 'Tạo bin (thư mục) mới trong Project panel. Có thể tạo trong root hoặc trong bin cha đã có.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên bin mới.' },
        parentBin: { type: 'string', description: 'Tên bin cha. Bỏ trống = tạo trong root project.' }
      },
      required: ['name']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('create_bin', { name: args.name, parentBin: args.parentBin }, 15000);
    }
  },

  {
    name: 'move_item_to_bin',
    description: 'Di chuyển một item trong Project panel sang bin khác theo tên.',
    inputSchema: {
      type: 'object',
      properties: {
        clipName: { type: 'string', description: 'Tên clip/item trong Project panel cần di chuyển.' },
        targetBin: { type: 'string', description: 'Tên bin đích.' }
      },
      required: ['clipName', 'targetBin']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('move_item_to_bin', { clipName: args.clipName, targetBin: args.targetBin }, 15000);
    }
  },

  {
    name: 'replace_clip_media',
    description: 'Thay thế file media của clip đang chọn bằng file mới, giữ nguyên vị trí trên timeline và tất cả effect đã áp.',
    inputSchema: {
      type: 'object',
      properties: {
        newFilePath: { type: 'string', description: 'Đường dẫn tuyệt đối đến file media mới.' }
      },
      required: ['newFilePath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('replace_clip_media', { newFilePath: args.newFilePath }, 20000);
    }
  },

  {
    name: 'relink_offline_media',
    description: 'Tự động relink (khớp lại đường dẫn) các clip offline trong project. Tìm file trong thư mục chỉ định.',
    inputSchema: {
      type: 'object',
      properties: {
        searchFolder: { type: 'string', description: 'Đường dẫn thư mục để tìm file. Bỏ trống = Premiere tự tìm theo vị trí gần đây.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('relink_offline_media', { searchFolder: args.searchFolder }, 30000);
    }
  },

  // ==========================================================================
  // GROUP 11 — Selection & Multi-clip Ops
  // ==========================================================================
  {
    name: 'select_clips_in_range',
    description: 'Chọn tất cả clip trên timeline nằm trong khoảng thời gian chỉ định. Có thể lọc theo loại track (video/audio/all).',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: { type: 'number', description: 'Bắt đầu khoảng thời gian (giây).' },
        endSeconds: { type: 'number', description: 'Kết thúc khoảng thời gian (giây).' },
        trackType: {
          type: 'string',
          description: '"video" | "audio" | "all" (mặc định "all").',
          enum: ['video', 'audio', 'all']
        }
      },
      required: ['startSeconds', 'endSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('select_clips_in_range', {
        startSeconds: args.startSeconds,
        endSeconds: args.endSeconds,
        trackType: args.trackType ?? 'all'
      }, 15000);
    }
  },

  {
    name: 'select_all_clips',
    description: 'Chọn tất cả clip trên timeline. Có thể lọc chỉ chọn video clips hoặc audio clips.',
    inputSchema: {
      type: 'object',
      properties: {
        trackType: {
          type: 'string',
          description: '"video" | "audio" | "all" (mặc định "all").',
          enum: ['video', 'audio', 'all']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('select_all_clips', { trackType: args.trackType ?? 'all' }, 15000);
    }
  },

  {
    name: 'deselect_all_clips',
    description: 'Bỏ chọn tất cả clip trên timeline.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('deselect_all_clips', {}, 10000);
    }
  },

  // ==========================================================================
  // GROUP 12 — Scene Detection
  // ==========================================================================
  {
    name: 'detect_scene_edits',
    description: 'Tự động phát hiện điểm chuyển cảnh trong clip video đang chọn (Scene Edit Detection). Có thể tự động thêm marker tại mỗi điểm chuyển cảnh. Yêu cầu Premiere 2022+.',
    inputSchema: {
      type: 'object',
      properties: {
        sensitivity: {
          type: 'number',
          description: 'Độ nhạy phát hiện (0-100). Cao hơn = phát hiện nhiều điểm hơn nhưng có thể nhiễu. Mặc định 50.',
          minimum: 0,
          maximum: 100
        },
        createMarkers: {
          type: 'boolean',
          description: 'true (mặc định) = tạo marker tại mỗi điểm chuyển cảnh, false = chỉ trả danh sách.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('detect_scene_edits', {
        sensitivity: args.sensitivity ?? 50,
        createMarkers: args.createMarkers !== false
      }, 120000);
    }
  },

  // ==========================================================================
  // GROUP 13 — Metadata
  // ==========================================================================
  {
    name: 'get_clip_metadata',
    description: 'Lấy metadata XMP của clip đang chọn: description, director, scene, keyword, v.v. Chỉ đọc.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Danh sách field cần đọc, ví dụ ["description", "director", "scene"]. Bỏ trống = trả tất cả field có giá trị.',
          items: { type: 'string' }
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_clip_metadata', { fields: args.fields }, 15000);
    }
  },

  {
    name: 'set_clip_metadata',
    description: 'Ghi metadata XMP lên clip đang chọn. Hỗ trợ các field như description, director, scene, keyword, comment.',
    inputSchema: {
      type: 'object',
      properties: {
        metadata: {
          type: 'object',
          description: 'Object { field: value } cần ghi, ví dụ { "description": "Cảnh 1", "director": "Nguyễn Văn A" }.'
        }
      },
      required: ['metadata']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_metadata', { metadata: args.metadata }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 14 — Motion Graphics & MOGRT
  // ==========================================================================
  {
    name: 'import_mogrt',
    description: 'Import file Motion Graphics Template (.mogrt) vào sequence tại thời điểm chỉ định. MOGRT sẽ được thêm vào video track mới.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối đến file .mogrt.' },
        insertAtSeconds: { type: 'number', description: 'Thời điểm insert (giây). Bỏ trống = chèn tại CTI hiện tại.' }
      },
      required: ['path']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('import_mogrt', { path: args.path, insertAtSeconds: args.insertAtSeconds }, 20000);
    }
  },

  {
    name: 'add_text_overlay',
    description: 'Thêm text overlay (Essential Graphics) vào sequence tại khoảng thời gian chỉ định. Chọn style: title (to, nổi bật), lower-third (chú thích bên dưới), caption (phụ đề nhỏ).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Nội dung text cần hiển thị.' },
        startSeconds: { type: 'number', description: 'Thời điểm bắt đầu hiển thị (giây).' },
        endSeconds: { type: 'number', description: 'Thời điểm kết thúc (giây).' },
        style: {
          type: 'string',
          description: '"title" | "lower-third" | "caption". Mặc định "lower-third".',
          enum: ['title', 'lower-third', 'caption']
        }
      },
      required: ['text', 'startSeconds', 'endSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('add_text_overlay', {
        text: args.text,
        startSeconds: args.startSeconds,
        endSeconds: args.endSeconds,
        style: args.style ?? 'lower-third'
      }, 20000);
    }
  },

  // ==========================================================================
  // GROUP 15 — Export Expanded
  // ==========================================================================
  {
    name: 'capture_frame',
    description: 'Chụp frame hiện tại của sequence và lưu ra file ảnh. Hỗ trợ PNG và JPEG.',
    inputSchema: {
      type: 'object',
      properties: {
        timeSeconds: { type: 'number', description: 'Thời điểm frame cần chụp (giây). Bỏ trống = CTI hiện tại.' },
        outputPath: { type: 'string', description: 'Đường dẫn lưu ảnh (bao gồm tên file + đuôi .png hoặc .jpg). Bỏ trống = tự sinh tên trong thư mục Desktop.' },
        format: {
          type: 'string',
          description: '"png" (mặc định) | "jpg".',
          enum: ['png', 'jpg']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('capture_frame', {
        timeSeconds: args.timeSeconds,
        outputPath: args.outputPath,
        format: args.format ?? 'png'
      }, 30000);
    }
  },

  {
    name: 'export_as_xml',
    description: 'Export sequence/project ra định dạng XML để trao đổi với phần mềm khác: FCP 7 XML, FCPXML (DaVinci), AAF.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: '"fcp7" (Final Cut Pro 7) | "fcpxml" (Final Cut Pro X / DaVinci) | "aaf" (Pro Tools).',
          enum: ['fcp7', 'fcpxml', 'aaf']
        },
        outputPath: { type: 'string', description: 'Đường dẫn lưu file XML.' }
      },
      required: ['format', 'outputPath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('export_as_xml', { format: args.format, outputPath: args.outputPath }, 60000);
    }
  },

  {
    name: 'export_to_media_encoder',
    description: 'Đưa sequence vào hàng đợi Adobe Media Encoder để encode. Có thể chỉ định preset và đường dẫn output.',
    inputSchema: {
      type: 'object',
      properties: {
        presetName: { type: 'string', description: 'Tên preset AME, ví dụ "H.264 1080p", "YouTube 1080p". Bỏ trống = dùng preset mặc định.' },
        outputPath: { type: 'string', description: 'Đường dẫn file output. Bỏ trống = Premiere tự chọn.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('export_to_media_encoder', {
        presetName: args.presetName,
        outputPath: args.outputPath
      }, 30000);
    }
  },

  // ==========================================================================
  // GROUP 16 — AI Features
  // ==========================================================================
  {
    name: 'transcribe_clip',
    description: 'Chuyển đổi giọng nói thành văn bản từ clip audio/video đang chọn. Ưu tiên dùng Premiere Speech-to-Text built-in (2023+). Nếu có OPENAI_API_KEY thì dùng Whisper API cho kết quả chính xác hơn.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Mã ngôn ngữ ISO 639-1, ví dụ "vi" (tiếng Việt), "en" (English), "auto" (tự detect). Mặc định "auto".'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('transcribe_clip', { language: args.language ?? 'auto' }, 300000);
    }
  },

  {
    name: 'auto_caption_from_speech',
    description: 'Tự động tạo caption từ giọng nói clip đang chọn. Workflow: transcribe_clip → create_caption_track → populate. Kết quả là caption track sẵn sàng chỉnh sửa trong Premiere.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Mã ngôn ngữ ISO 639-1. Mặc định "auto".'
        },
        style: {
          type: 'string',
          description: '"subtitle" (mặc định, Open Captions) | "captions" (CEA-708).',
          enum: ['subtitle', 'captions']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('auto_caption_from_speech', {
        language: args.language ?? 'auto',
        style: args.style ?? 'subtitle'
      }, 360000);
    }
  },

  // ==========================================================================
  // GROUP 17 — Timeline Placement & Sequence Management (2026-09-09)
  // API xác nhận qua @adobe/premierepro type declarations + sample repo chính
  // thức Adobe, CHƯA test trên Premiere thật — xem premiere-uxp-scripting-api-
  // capabilities.md trong memory. add_track/remove_track KHÔNG có tool riêng vì
  // Adobe xác nhận chưa có API — insert_clip/overwrite_clip sẽ báo lỗi rõ ràng
  // nếu videoTrackIndex/audioTrackIndex vượt quá số track hiện có thay vì âm
  // thầm thất bại.
  // ==========================================================================
  {
    name: 'insert_clip',
    description: 'Đặt 1 item từ Project panel (video, ảnh PNG, v.v. — tìm theo tên, kể cả trong bin con) lên timeline tại thời điểm chỉ định, kiểu INSERT (đẩy các clip sau đó sang phải). Với ảnh tĩnh, truyền durationSeconds để set thời lượng hiển thị (mặc định theo still-image duration preference của Premiere). Báo lỗi rõ nếu videoTrackIndex/audioTrackIndex vượt quá số track hiện có (chưa có API script tạo track mới).',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên item trong Project panel cần đặt lên timeline.' },
        startSeconds: { type: 'number', description: 'Thời điểm đặt clip, tính theo sequence time (giây từ đầu sequence).' },
        videoTrackIndex: { type: 'number', description: 'Chỉ số video track đích (0 = V1). Mặc định 0.' },
        audioTrackIndex: { type: 'number', description: 'Chỉ số audio track đích (0 = A1). Mặc định 0.' },
        durationSeconds: { type: 'number', description: 'Thời lượng hiển thị mong muốn (giây) — chủ yếu dùng cho ảnh tĩnh không có duration gốc.' }
      },
      required: ['itemName', 'startSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('insert_clip', args, 30000);
    }
  },

  {
    name: 'overwrite_clip',
    description: 'Giống insert_clip nhưng kiểu OVERWRITE (ghi đè lên clip đang có tại vị trí đó thay vì đẩy sang phải).',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên item trong Project panel cần đặt lên timeline.' },
        startSeconds: { type: 'number', description: 'Thời điểm đặt clip, tính theo sequence time.' },
        videoTrackIndex: { type: 'number', description: 'Chỉ số video track đích (0 = V1). Mặc định 0.' },
        audioTrackIndex: { type: 'number', description: 'Chỉ số audio track đích (0 = A1). Mặc định 0.' },
        durationSeconds: { type: 'number', description: 'Thời lượng hiển thị mong muốn (giây) — chủ yếu dùng cho ảnh tĩnh.' }
      },
      required: ['itemName', 'startSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('overwrite_clip', args, 30000);
    }
  },

  {
    name: 'duplicate_clip',
    description: 'Nhân bản clip đang chọn trên timeline, đặt bản sao lệch đi offsetSeconds về thời gian (và tuỳ chọn lệch track). Verify bằng cách đếm tổng track item trước/sau, không xác định chính xác track item mới bằng identity.',
    inputSchema: {
      type: 'object',
      properties: {
        offsetSeconds: { type: 'number', description: 'Độ lệch thời gian của bản sao so với clip gốc (giây). Mặc định 1.' },
        videoTrackOffset: { type: 'number', description: 'Độ lệch video track so với track gốc. Mặc định 0 (cùng track).' },
        audioTrackOffset: { type: 'number', description: 'Độ lệch audio track so với track gốc. Mặc định 0.' },
        alignToVideo: { type: 'boolean', description: 'Căn theo video khi có cả audio+video linked. Mặc định true.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('duplicate_clip', args, 30000);
    }
  },

  {
    name: 'create_sequence',
    description: 'Tạo sequence mới trong project đang mở. Có thể tạo rỗng hoặc từ item đang chọn trong Project panel (fromSelectedMedia=true).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên sequence mới.' },
        fromSelectedMedia: { type: 'boolean', description: 'true = tạo sequence từ (các) item đang chọn trong Project panel. Mặc định false (sequence rỗng).' }
      },
      required: ['name']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('create_sequence', args, 30000);
    }
  },

  {
    name: 'duplicate_sequence',
    description: 'Nhân bản 1 sequence (mặc định là sequence đang active, hoặc chỉ định sourceSequenceName). Dùng Sequence.createCloneAction() — chưa test trên Premiere thật.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceSequenceName: { type: 'string', description: 'Tên sequence nguồn cần duplicate. Bỏ trống = dùng sequence đang active.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('duplicate_sequence', args, 30000);
    }
  },

  {
    name: 'set_active_sequence',
    description: 'Chuyển sequence đang active của project sang sequence chỉ định theo tên.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên sequence cần chuyển sang active.' }
      },
      required: ['name']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_active_sequence', args, 15000);
    }
  },

  // ==========================================================================
  // GROUP 17b — Generic Markers (2026-09-09) — khác marker nhịp beat, tag riêng
  // bằng "[MCP marker]" trong comment để không đụng vào marker Beat Shake tạo ra.
  // ==========================================================================
  {
    name: 'add_marker',
    description: 'Thêm 1 marker thường (không phải marker nhịp) lên sequence hoặc clip đang chọn, có tên/màu/comment/duration tuỳ chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên marker.' },
        timeSeconds: { type: 'number', description: 'Thời điểm đặt marker (giây).' },
        durationSeconds: { type: 'number', description: 'Thời lượng marker (giây). Mặc định 0 (marker điểm).' },
        comment: { type: 'string', description: 'Comment cho marker (tuỳ chọn).' },
        colorIndex: { type: 'number', description: 'Chỉ số màu marker (tuỳ chọn, theo bảng màu Premiere).' },
        scope: { type: 'string', description: '"sequence" (mặc định) hoặc "clip" (clip đang chọn trên timeline).', enum: ['sequence', 'clip'] }
      },
      required: ['name', 'timeSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('add_marker', args, 15000);
    }
  },

  {
    name: 'remove_marker',
    description: 'Xoá marker thường khớp theo tên và/hoặc thời điểm, trên sequence hoặc clip đang chọn. Không đụng vào marker nhịp beat.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên marker cần xoá (tuỳ chọn nếu có timeSeconds).' },
        timeSeconds: { type: 'number', description: 'Thời điểm marker cần xoá, dung sai 0.05s (tuỳ chọn nếu có name).' },
        scope: { type: 'string', description: '"sequence" (mặc định) hoặc "clip".', enum: ['sequence', 'clip'] }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_marker', args, 15000);
    }
  },

  {
    name: 'update_marker',
    description: 'Sửa marker thường đã có (tìm theo tên hoặc thời điểm): đổi tên, comment, duration, hoặc màu.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên marker hiện tại cần tìm (tuỳ chọn nếu có timeSeconds).' },
        timeSeconds: { type: 'number', description: 'Thời điểm marker cần tìm (tuỳ chọn nếu có name).' },
        newName: { type: 'string', description: 'Tên mới.' },
        newComment: { type: 'string', description: 'Comment mới.' },
        newDurationSeconds: { type: 'number', description: 'Duration mới (giây).' },
        newColorIndex: { type: 'number', description: 'Màu mới (chỉ số).' },
        scope: { type: 'string', description: '"sequence" (mặc định) hoặc "clip".', enum: ['sequence', 'clip'] }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('update_marker', args, 15000);
    }
  },

  // ==========================================================================
  // GROUP 18 — Subtitle sync workaround (2026-09-09) — vì không có API script tạo
  // text overlay (xem addTextOverlay), đây là đường vòng thật sự chạy được: sinh
  // file .srt đúng time range/text rồi import vào Project — vẫn cần 1 thao tác
  // tay cuối (kéo vào caption track).
  // ==========================================================================
  {
    name: 'generate_and_import_srt',
    description: 'Sinh file phụ đề .srt từ danh sách đoạn {startSeconds, endSeconds, text} rồi import vào Project panel. KHÔNG tự đặt lên caption track — cần kéo tay 1 lần vào caption track sau khi import (dùng create_caption_track để tạo track trước nếu cần). Đây là đường vòng thật cho việc "thêm sub text theo lời thoại" vì Premiere chưa có API script tạo text overlay trực tiếp.',
    inputSchema: {
      type: 'object',
      properties: {
        segments: {
          type: 'array',
          description: 'Danh sách đoạn phụ đề.',
          items: {
            type: 'object',
            properties: {
              startSeconds: { type: 'number' },
              endSeconds: { type: 'number' },
              text: { type: 'string' }
            },
            required: ['startSeconds', 'endSeconds', 'text']
          }
        },
        outputPath: { type: 'string', description: 'Đường dẫn file .srt sẽ ghi ra, ví dụ "D:\\\\project\\\\subs.srt".' },
        binName: { type: 'string', description: 'Bin đích trong Project panel (tuỳ chọn).' }
      },
      required: ['segments', 'outputPath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('generate_and_import_srt', args, 30000);
    }
  },

  // ==========================================================================
  // GROUP 19 — THỬ NGHIỆM: Transcript-JSON (2026-09-09) — CHƯA xác nhận hoạt
  // động trên Premiere thật, cần test trực tiếp trước khi tin cậy. Xem cảnh báo
  // trong warning field của kết quả trả về.
  // ==========================================================================
  {
    name: 'import_transcript_json',
    description: 'THỬ NGHIỆM, CHƯA XÁC NHẬN: gắn transcript dạng JSON (text + time range tuỳ ý, không cần từ audio thật) vào clip đang chọn qua Transcript.importFromJSON — hướng đi khả dĩ để có "sub text theo lời thoại" mà không cần Essential Graphics. Chưa rõ bước convert transcript→caption có script được không. Cần mở Premiere kiểm tra Text panel sau khi chạy.',
    inputSchema: {
      type: 'object',
      properties: {
        segments: {
          type: 'array',
          description: 'Danh sách đoạn transcript.',
          items: {
            type: 'object',
            properties: {
              startSeconds: { type: 'number' },
              endSeconds: { type: 'number' },
              text: { type: 'string' }
            },
            required: ['startSeconds', 'endSeconds', 'text']
          }
        }
      },
      required: ['segments']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('import_transcript_json', args, 30000);
    }
  }
];
